const STORAGE_KEY = 'HiddenElements';
let cleanupTimer = null;
let pendingCleanup = null;
const tabOrigins = new Map();

function normalizeAndFormatDomain(inputDomain) {
    let domain = inputDomain.trim().toLowerCase();
    if (!domain) return null;
    domain = domain.replace(/^https?:\/\//, '');
    domain = domain.replace(/^\*\./, '');
    domain = domain.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
    domain = domain.replace(/^www\./, '');
    return '*.' + domain;
}

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

function isWhitelistedDomain(domain, whitelist) {
    domain = domain.replace(/^\./, '').toLowerCase();
    return whitelist.some(site => {
        site = site.trim().replace(/^\./, '').toLowerCase();
        if (!site) return false;
        if (site.startsWith('*.')) {
            const baseDomain = site.slice(2);
            return domain === baseDomain || domain.endsWith('.' + baseDomain);
        }
        return domain === site || domain.endsWith('.' + site);
    });
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

function rememberTab(tab) {
    if (!tab || !tab.id || !tab.url) {
        return;
    }

    const origin = getOriginFromUrl(tab.url);
    if (!origin) {
        tabOrigins.delete(tab.id);
        return;
    }

    tabOrigins.set(tab.id, origin);
}

function scheduleCleanup(removedTabId, removedOrigin, removedWindowId) {
    pendingCleanup = { removedTabId, removedOrigin, removedWindowId };

    if (cleanupTimer) {
        clearTimeout(cleanupTimer);
    }

    cleanupTimer = setTimeout(() => {
        cleanupTimer = null;
        const cleanupContext = pendingCleanup;
        pendingCleanup = null;
        cleanAllUnwhitelistedData(cleanupContext);
    }, 250);
}

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

function cleanAllUnwhitelistedData(cleanupContext) {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const whitelist = result[STORAGE_KEY] || [];

        getOpenOrigins((openOrigins) => {
            chrome.cookies.getAll({}, (cookies) => {
                if (!cookies || !cookies.length) return;

                const originsToRemove = new Set();
                const cookieRemovalPromises = cookies.map((cookie) => {
                    const rawDomain = cookie.domain || '';
                    const cookieDomain = rawDomain.replace(/^\./, '').toLowerCase();

                    if (isWhitelistedDomain(cookieDomain, whitelist)) {
                        return Promise.resolve();
                    }

                    // Check if any open tab matches this cookie's domain
                    let isProtected = false;
                    for (const origin of openOrigins) {
                        if (originMatchesCookie(origin, cookieDomain)) {
                            isProtected = true;
                            break;
                        }
                    }

                    if (isProtected) {
                        return Promise.resolve();
                    }

                    const cleanDomain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain;
                    const protocol = cookie.secure ? 'https://' : 'http://';
                    const cookieOrigin = `${protocol}${cleanDomain}`;

                    originsToRemove.add(cookieOrigin);

                    return new Promise((resolve) => {
                        chrome.cookies.remove({
                            url: `${cookieOrigin}${cookie.path}`,
                            name: cookie.name,
                            storeId: cookie.storeId
                        }, () => resolve());
                    });
                });

                Promise.all(cookieRemovalPromises).then(() => {
                    if (!originsToRemove.size) return;

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

chrome.tabs.onCreated.addListener(rememberTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status) {
        rememberTab(tab);
    }
});
chrome.tabs.onAttached.addListener((tabId) => {
    chrome.tabs.get(tabId, rememberTab);
});
chrome.tabs.onDetached.addListener((tabId) => {
    chrome.tabs.get(tabId, rememberTab);
});
chrome.tabs.onReplaced.addListener((addedTabId) => {
    chrome.tabs.get(addedTabId, rememberTab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    const removedOrigin = tabOrigins.get(tabId) || null;
    tabOrigins.delete(tabId);
    scheduleCleanup(tabId, removedOrigin, null);
});

chrome.windows.onRemoved.addListener((windowId) => {
    scheduleCleanup(null, null, windowId);
});

chrome.runtime.onStartup.addListener(() => {
    scheduleCleanup();
});

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
    }
    return true;
});