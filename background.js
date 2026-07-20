const STORAGE_KEY = 'HiddenElements';
const tabUrls = {};

// Track URLs as they update
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        try {
            tabUrls[tabId] = new URL(changeInfo.url).hostname;
        } catch (e) {
            delete tabUrls[tabId];
        }
    }
});

// Clean up memory and data when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabUrls[tabId]) {
        clearSiteDataForDomain(tabUrls[tabId]);
        delete tabUrls[tabId];
    }
});

async function clearSiteDataForDomain(domain) {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const whitelist = result[STORAGE_KEY] || [];

    // Check if the domain or its parent is whitelisted
    const isWhitelisted = whitelist.some(site => 
        domain === site || domain.endsWith('.' + site)
    );
    
    if (!isWhitelisted) {
        const rootDomain = domain.split('.').slice(-2).join('.');
        
        // 1. Clear Cookies
        const cookiesSpecific = await chrome.cookies.getAll({ domain: domain });
        const cookiesRoot = (domain !== rootDomain) ? await chrome.cookies.getAll({ domain: rootDomain }) : [];
        const allCookies = [...cookiesSpecific, ...cookiesRoot];
        
        const uniqueCookies = [...new Set(allCookies.map(c => JSON.stringify(c)))].map(c => JSON.parse(c));

        uniqueCookies.forEach((cookie) => {
            if (cookie.domain === domain || cookie.domain.endsWith('.' + domain) || cookie.domain.endsWith('.' + rootDomain)) {
                const protocol = cookie.secure ? "https://" : "http://";
                chrome.cookies.remove({ 
                    url: protocol + cookie.domain + cookie.path, 
                    name: cookie.name 
                });
            }
        });

        // 2. Clear Local Storage, IndexedDB, Cache, and other Site Data using browsingData API
        const origins = [`https://${domain}`, `http://${domain}`];
        if (domain !== rootDomain) {
            origins.push(`https://${rootDomain}`, `http://${rootDomain}`);
        }

        const removalOptions = {
            origins: origins
        };

        const dataToRemove = {
            appcache: true,
            cache: true,
            cacheStorage: true,
            fileSystems: true,
            indexedDB: true,
            localStorage: true,
            serviceWorkers: true,
            webSQL: true
        };

        chrome.browsingData.remove(removalOptions, dataToRemove, () => {
            // Site data completely cleared for these origins
        });
    }
}

// Keep your existing message listener for the whitelist
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "addMultipleToWhitelist") {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
            let list = res[STORAGE_KEY] || [];
            request.domains.forEach(d => {
                if (!list.includes(d)) list.push(d);
            });
            chrome.storage.local.set({ [STORAGE_KEY]: list });
        });
    }
});