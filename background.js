const STORAGE_KEY = 'HiddenElements';
const tabUrls = {};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        try {
            const url = new URL(changeInfo.url);
            tabUrls[tabId] = url.hostname;
        } catch (e) {
            delete tabUrls[tabId];
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabUrls[tabId]) {
        const domain = tabUrls[tabId];
        setTimeout(() => clearSiteDataForDomain(domain), 500);
        delete tabUrls[tabId];
    }
});

function isWhitelistedDomain(domain, whitelist) {
    return whitelist.some(site => {
        site = site.trim();
        if (!site) return false;
        if (site.startsWith('*.')) {
            const baseDomain = site.slice(2);
            return domain === baseDomain || domain.endsWith('.' + baseDomain);
        }
        return domain === site || domain.endsWith('.' + site);
    });
}

async function clearSiteDataForDomain(domain) {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const whitelist = result[STORAGE_KEY] || [];

    if (isWhitelistedDomain(domain, whitelist)) return;

    // To completely eliminate leftover registry entries for deep subdomains like docs.tomorrow.io,
    // we explicitly target the exact host, the wildcard variant, and the root domain.
    const rootDomain = domain.split('.').slice(-2).join('.');
    const origins = [
        `https://${domain}/`, 
        `http://${domain}/`,
        `https://*.${domain}/`,
        `http://*.${domain}/`
    ];
    
    if (domain !== rootDomain) {
        origins.push(
            `https://${rootDomain}/`, 
            `http://${rootDomain}/`,
            `https://*.${rootDomain}/`,
            `http://*.${rootDomain}/`
        );
    }

    const removalOptions = {
        origins: [...new Set(origins)],
        originTypes: { unprotectedWeb: true, protectedWeb: true, extension: true }
    };

    const dataToRemove = {
        cookies: true,
        appcache: true,
        cache: true,
        cacheStorage: true,
        fileSystems: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        webSQL: true,
        pluginData: true
    };

    chrome.browsingData.remove(removalOptions, dataToRemove, () => {
        if (chrome.runtime.lastError) {
            console.error("Cleanup failed: ", chrome.runtime.lastError);
        }
    });
}

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