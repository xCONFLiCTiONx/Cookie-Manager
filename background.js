const STORAGE_KEY = 'HiddenElements';
let cleanupTimer = null;

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
function scheduleCleanup() {
    if (cleanupTimer) {
        clearTimeout(cleanupTimer);
    }

    cleanupTimer = setTimeout(() => {
        cleanupTimer = null;
        cleanAllUnwhitelistedData();
    }, 500); // Slightly longer delay to ensure tab state is settled
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
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const whitelist = result[STORAGE_KEY] || [];
        const matchers = createWhitelistMatchers(whitelist);

        getOpenOrigins((openOrigins) => {
            chrome.cookies.getAll({}, (cookies) => {
                if (!cookies || !cookies.length) return;

                const originsToRemove = new Set();
                const cookieRemovalPromises = [];

                cookies.forEach((cookie) => {
                    const rawDomain = cookie.domain || '';
                    const cookieDomain = rawDomain.replace(/^\./, '').toLowerCase();

                    // 1. Check Whitelist
                    if (isWhitelisted(cookieDomain, matchers)) {
                        return;
                    }

                    // 2. Check Open Tabs
                    let isProtected = false;
                    for (const origin of openOrigins) {
                        if (originMatchesCookie(origin, cookieDomain)) {
                            isProtected = true;
                            break;
                        }
                    }

                    if (isProtected) {
                        return;
                    }

                    // 3. Prepare for removal
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

                Promise.all(cookieRemovalPromises).then(() => {
                    if (!originsToRemove.size) return;

                    // Also clear other site data (localStorage, etc) for these origins
                    chrome.browsingData.remove({
                        origins: [...originsToRemove],
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
                    });
                });
            });
        });
    });
}

// Lifecycle Events
chrome.tabs.onRemoved.addListener(scheduleCleanup);
chrome.windows.onRemoved.addListener(scheduleCleanup);
chrome.runtime.onStartup.addListener(scheduleCleanup);
chrome.runtime.onInstalled.addListener(scheduleCleanup);

// Handle messages from popup/options
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'addMultipleToWhitelist') {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
            let list = res[STORAGE_KEY] || [];
            request.domains.forEach(d => {
                const formatted = normalizeAndFormatDomain(d);
                if (formatted && !list.includes(formatted)) {
                    list.push(formatted);
                }
            });
            const optimizedList = cleanAndOptimizeList(list);
            chrome.storage.local.set({ [STORAGE_KEY]: optimizedList }, () => {
                scheduleCleanup();
            });
        });
    } else if (request.action === 'triggerManualCleanup') {
        cleanAllUnwhitelistedData();
        sendResponse({ status: 'started' });
    }
    return true;
});