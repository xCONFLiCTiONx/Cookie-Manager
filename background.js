const STORAGE_KEY = 'HiddenElements';
const VISITED_ORIGINS_KEY = 'VisitedOrigins';
let cleanupTimer = null;

/**
 * Tracks an origin when a tab is updated
 */
function trackOrigin(url) {
    if (!url || !url.startsWith('http')) return;
    const origin = getOriginFromUrl(url);
    if (!origin) return;

    chrome.storage.local.get([VISITED_ORIGINS_KEY], (result) => {
        const origins = new Set(result[VISITED_ORIGINS_KEY] || []);
        if (!origins.has(origin)) {
            origins.add(origin);
            chrome.storage.local.set({ [VISITED_ORIGINS_KEY]: Array.from(origins) });
        }
    });
}

/**
 * Normalizes a domain for the whitelist (e.g. "https://www.google.com" -> "*.google.com")
 */
function normalizeAndFormatDomain(inputDomain) {
    let domain = inputDomain.trim().toLowerCase();
    if (!domain) return null;
    domain = domain.replace(/^https?:\/\//, '');
    domain = domain.replace(/^\*\./, '');
    domain = domain.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
    domain = domain.replace(/^www\./, '');
    return '*.' + domain;
}

/**
 * Cleans up the whitelist by removing redundancies and sorting
 */
function cleanAndOptimizeList(list) {
    const normalized = list.map(normalizeAndFormatDomain).filter(Boolean);
    const unique = [...new Set(normalized)];
    unique.sort((a, b) => a.length - b.length);

    const optimized = [];
    for (const item of unique) {
        const base = item.slice(2);
        const isRedundant = optimized.some(existing => {
            const existingBase = existing.slice(2);
            return base === existingBase || base.endsWith('.' + existingBase);
        });
        if (!isRedundant) {
            optimized.push(item);
        }
    }
    return optimized.sort();
}

/**
 * Creates a fast lookup object for the whitelist
 */
function createWhitelistMatchers(whitelist) {
    const exact = new Set();
    const wildcards = [];
    whitelist.forEach(site => {
        const normalized = site.trim().replace(/^\./, '').toLowerCase();
        if (!normalized) return;
        if (normalized.startsWith('*.')) {
            wildcards.push(normalized.slice(2));
        } else {
            exact.add(normalized);
        }
    });
    return { exact, wildcards };
}

function isWhitelisted(domain, matchers) {
    const d = domain.replace(/^\./, '').toLowerCase();
    if (matchers.exact.has(d)) return true;
    return matchers.wildcards.some(base => d === base || d.endsWith('.' + base));
}

function getOriginFromUrl(url) {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}`;
    } catch (e) {
        return null;
    }
}

function normalizeHost(hostname) {
    return hostname.replace(/^\./, '').toLowerCase();
}

/**
 * Checks if a specific origin (from a tab) matches a cookie's domain
 */
function originMatchesCookie(origin, cookieDomain) {
    if (!origin || !cookieDomain) return false;
    try {
        const originHost = new URL(origin).hostname;
        const cookieHost = normalizeHost(cookieDomain);
        return originHost === cookieHost || originHost.endsWith('.' + cookieHost) || cookieHost.endsWith('.' + originHost);
    } catch (e) {
        return false;
    }
}

/**
 * Debounced cleanup trigger
 */
function scheduleCleanup(source) {
    chrome.storage.local.get(['isSetup', 'deleteOnChromeClose', 'deleteOnTabClose'], (settings) => {
        if (!settings.isSetup) return;

        if (source === 'tab' && !settings.deleteOnTabClose) return;
        if (source === 'browser' && !settings.deleteOnChromeClose) return;

        if (cleanupTimer) {
            clearTimeout(cleanupTimer);
        }

        cleanupTimer = setTimeout(() => {
            cleanupTimer = null;
            cleanAllUnwhitelistedData();
        }, 500); // Slightly longer delay to ensure tab state is settled
    });
}

/**
 * Queries all open tabs to find active origins
 */
function getOpenOrigins(callback) {
    chrome.tabs.query({}, (tabs) => {
        const origins = new Set();
        tabs.forEach((tab) => {
            if (!tab.url) return;
            const origin = getOriginFromUrl(tab.url);
            if (origin) {
                origins.add(origin);
            }
        });
        callback(origins);
    });
}

/**
 * The core cleanup logic: removes all data for domains that are NOT whitelisted AND NOT open
 */
function cleanAllUnwhitelistedData() {
    chrome.storage.local.get([STORAGE_KEY, 'isSetup', VISITED_ORIGINS_KEY], (result) => {
        if (!result.isSetup) return;

        const whitelist = result[STORAGE_KEY] || [];
        const matchers = createWhitelistMatchers(whitelist);
        const visitedOrigins = result[VISITED_ORIGINS_KEY] || [];

        getOpenOrigins((openOrigins) => {
            chrome.cookies.getAll({}, (cookies) => {
                const originsToRemove = new Set();
                const cookieRemovalPromises = [];

                // 1. Process cookies to find origins and remove cookies
                if (cookies && cookies.length) {
                    cookies.forEach((cookie) => {
                        const rawDomain = cookie.domain || '';
                        const cookieDomain = rawDomain.replace(/^\./, '').toLowerCase();

                        // Check Whitelist
                        if (isWhitelisted(cookieDomain, matchers)) return;

                        // Check Open Tabs
                        let isProtected = false;
                        for (const origin of openOrigins) {
                            if (originMatchesCookie(origin, cookieDomain)) {
                                isProtected = true;
                                break;
                            }
                        }
                        if (isProtected) return;

                        // Prepare for removal
                        const cleanDomain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain;
                        const protocol = cookie.secure ? 'https://' : 'http://';
                        const cookieOrigin = `${protocol}${cleanDomain}`;
                        originsToRemove.add(cookieOrigin);

                        cookieRemovalPromises.push(new Promise((resolve) => {
                            chrome.cookies.remove({
                                url: `${cookieOrigin}${cookie.path}`,
                                name: cookie.name,
                                storeId: cookie.storeId
                            }, () => resolve());
                        }));
                    });
                }

                // 2. Process visited origins (covers sites with no cookies or session cookies that are gone)
                visitedOrigins.forEach(origin => {
                    try {
                        const hostname = new URL(origin).hostname;
                        const domain = hostname.replace(/^\./, '').toLowerCase();

                        // Check Whitelist
                        if (isWhitelisted(domain, matchers)) return;

                        // Check Open Tabs
                        if (openOrigins.has(origin)) return;

                        originsToRemove.add(origin);
                    } catch (e) {
                        // Invalid origin in storage
                    }
                });

                Promise.all(cookieRemovalPromises).then(() => {
                    if (!originsToRemove.size) return;

                    const originsArray = Array.from(originsToRemove);

                    // Clear site data (localStorage, etc) for these origins
                    chrome.browsingData.remove({
                        origins: originsArray,
                        originTypes: { unprotectedWeb: true, protectedWeb: true }
                    }, {
                        cache: true,
                        cacheStorage: true,
                        cookies: true,
                        fileSystems: true,
                        indexedDB: true,
                        localStorage: true,
                        serviceWorkers: true,
                        webSQL: true
                    }, () => {
                        // After successful removal, update visitedOrigins to remove the cleared ones
                        chrome.storage.local.get([VISITED_ORIGINS_KEY], (res) => {
                            const currentVisited = new Set(res[VISITED_ORIGINS_KEY] || []);
                            let changed = false;
                            originsArray.forEach(o => {
                                if (currentVisited.has(o)) {
                                    currentVisited.delete(o);
                                    changed = true;
                                }
                            });
                            if (changed) {
                                chrome.storage.local.set({ [VISITED_ORIGINS_KEY]: Array.from(currentVisited) });
                            }
                        });
                    });
                });
            });
        });
    });
}

// Lifecycle Events
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        trackOrigin(tab.url);
    }
});
chrome.tabs.onRemoved.addListener(() => scheduleCleanup('tab'));
chrome.windows.onRemoved.addListener(() => scheduleCleanup('browser'));
chrome.runtime.onStartup.addListener(() => scheduleCleanup('browser'));
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.storage.local.set({
            isSetup: false,
            deleteOnChromeClose: false,
            deleteOnTabClose: false,
            [STORAGE_KEY]: [],
            [VISITED_ORIGINS_KEY]: []
        });
    } else {
        scheduleCleanup('browser');
    }
});

// Handle messages from popup/options
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'addMultipleToWhitelist') {
        chrome.storage.local.get([STORAGE_KEY, 'isSetup'], (res) => {
            let list = res[STORAGE_KEY] || [];
            request.domains.forEach(d => {
                const formatted = normalizeAndFormatDomain(d);
                if (formatted && !list.includes(formatted)) {
                    list.push(formatted);
                }
            });
            const optimizedList = cleanAndOptimizeList(list);

            const updates = { [STORAGE_KEY]: optimizedList };
            if (!res.isSetup) updates.isSetup = true;

            chrome.storage.local.set(updates, () => {
                // If we just setup, we might want to trigger a cleanup if settings allow
                // But usually setup is done in options page where they set the settings too
                scheduleCleanup('browser');
            });
        });
    } else if (request.action === 'triggerManualCleanup') {
        cleanAllUnwhitelistedData();
        sendResponse({ status: 'started' });
    }
    return true;
});