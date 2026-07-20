const STORAGE_KEY = 'HiddenElements';

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

chrome.tabs.onRemoved.addListener(() => {
    clearNonWhitelistedCookies();
});

async function clearNonWhitelistedCookies() {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const whitelist = result[STORAGE_KEY] || [];
    const allCookies = await chrome.cookies.getAll({});

    allCookies.forEach((cookie) => {
        const isWhitelisted = whitelist.some(site => 
            cookie.domain === site || cookie.domain.endsWith('.' + site)
        );
        
        if (!isWhitelisted) {
            const protocol = cookie.secure ? "https://" : "http://";
            chrome.cookies.remove({ 
                url: protocol + cookie.domain + cookie.path, 
                name: cookie.name 
            });
        }
    });
}