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

function clearSiteDataForDomain(domain) {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const whitelist = result[STORAGE_KEY] || [];

        if (isWhitelistedDomain(domain, whitelist)) return;

        const parts = domain.split('.');
        const origins = [];
        
        for (let i = 0; i <= parts.length - 2; i++) {
            const sub = parts.slice(i).join('.');
            origins.push(`https://${sub}/`, `http://${sub}/`);
        }
        origins.push(`https://${domain}/`, `http://${domain}/`);

        const uniqueOrigins = [...new Set(origins)];

        const removalOptions = {
            origins: uniqueOrigins,
            originTypes: { unprotectedWeb: true, protectedWeb: true }
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

        chrome.browsingData.remove(removalOptions, dataToRemove, () => {});

        const rootDomain = parts.slice(-2).join('.');
        if (rootDomain && rootDomain !== domain) {
            chrome.browsingData.remove({
                origins: [`https://${rootDomain}/`, `http://${rootDomain}/`],
                originTypes: { unprotectedWeb: true, protectedWeb: true }
            }, dataToRemove, () => {});
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