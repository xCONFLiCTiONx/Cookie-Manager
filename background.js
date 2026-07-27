const STORAGE_KEY = 'HiddenElements';

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

function cleanAllUnwhitelistedData() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const whitelist = result[STORAGE_KEY] || [];

        chrome.cookies.getAll({}, (cookies) => {
            if (!cookies) return;

            cookies.forEach(cookie => {
                const rawDomain = cookie.domain;
                const cookieDomain = rawDomain.replace(/^\./, '').toLowerCase();
                
                if (!isWhitelistedDomain(cookieDomain, whitelist)) {
                    const protocol = cookie.secure ? "https://" : "http://";
                    const cleanDomain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain;
                    const url = `${protocol}${cleanDomain}${cookie.path}`;
                    
                    chrome.cookies.remove({
                        url: url,
                        name: cookie.name,
                        storeId: cookie.storeId
                    });

                    const removalOptions = {
                        origins: [`https://${cleanDomain}/`, `http://${cleanDomain}/`],
                        originTypes: { unprotectedWeb: true, protectedWeb: true }
                    };

                    const dataToRemove = {
                        cache: true,
                        cacheStorage: true,
                        fileSystems: true,
                        indexedDB: true,
                        localStorage: true,
                        serviceWorkers: true,
                        webSQL: true
                    };

                    chrome.browsingData.remove(removalOptions, dataToRemove);
                }
            });
        });
    });
}

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    cleanAllUnwhitelistedData();
});

chrome.runtime.onStartup.addListener(() => {
    cleanAllUnwhitelistedData();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "addMultipleToWhitelist") {
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
                cleanAllUnwhitelistedData();
            });
        });
    }
    return true;
});