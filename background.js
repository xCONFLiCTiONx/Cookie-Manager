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

// Helper function to check wildcards like *.live.com
function isWhitelistedDomain(domain, whitelist) {
    return whitelist.some(site => {
        site = site.trim();
        if (!site) return false;

        // Handle wildcard matching (e.g., *.live.com)
        if (site.startsWith('*.')) {
            const baseDomain = site.slice(2);
            return domain === baseDomain || domain.endsWith('.' + baseDomain);
        }
        
        // Exact match or normal subdomain check
        return domain === site || domain.endsWith('.' + site);
    });
}

async function clearSiteDataForDomain(domain) {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const whitelist = result[STORAGE_KEY] || [];

    // Check against the whitelist using wildcard support
    if (isWhitelistedDomain(domain, whitelist)) {
        return; // Skip deletion if whitelisted
    }
    
    // 1. Clear Cookies flexibly for the domain and its variants
    const cookies = await chrome.cookies.getAll({});
    
    cookies.forEach((cookie) => {
        const cookieDomainClean = cookie.domain.replace(/^\./, '');
        if (domain === cookieDomainClean || domain.endsWith('.' + cookieDomainClean) || cookieDomainClean.endsWith('.' + domain)) {
            const protocol = cookie.secure ? "https://" : "http://";
            chrome.cookies.remove({ 
                url: protocol + cookie.domain + cookie.path, 
                name: cookie.name 
            });
        }
    });

    // 2. Clear Site Data using a broader origin scope to catch all storage
    chrome.browsingData.remove(
        { 
            origins: [`https://${domain}/`, `http://${domain}/`],
            hostnames: [domain] 
        },
        {
            appcache: true,
            cache: true,
            cacheStorage: true,
            fileSystems: true,
            indexedDB: true,
            localStorage: true,
            serviceWorkers: true,
            webSQL: true,
            pluginData: true
        },
        () => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
            }
        }
    );
}

// Message listener for the whitelist
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