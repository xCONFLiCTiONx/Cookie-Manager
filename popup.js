const STORAGE_KEY = 'HiddenElements';

function isWhitelisted(domain, whitelist) {
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

// Initial state check
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) return;

    try {
        const url = new URL(tab.url);
        const hostname = url.hostname;

        chrome.storage.local.get([STORAGE_KEY, 'isSetup'], (res) => {
            const whitelist = res[STORAGE_KEY] || [];
            const btn = document.getElementById('excludeBtn');

            if (!res.isSetup) {
                document.getElementById('setupNotice').style.display = 'block';
            }

            if (isWhitelisted(hostname, whitelist)) {
                btn.innerText = "Whitelisted";
                btn.style.color = "#888";
                btn.style.backgroundColor = "#1e1e1e";
                btn.disabled = true;
            }
        });
    } catch (e) {
        // Restricted page
    }
});

// Exclude (Whitelist) current tab
document.getElementById('excludeBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.url) return;

        try {
            const url = new URL(tab.url);
            const domain = url.hostname.replace(/^www\./, '');
            
            // Get all cookie domains associated with this URL to ensure total whitelist
            const cookies = await chrome.cookies.getAll({ url: tab.url });
            const domains = [...new Set([domain, ...cookies.map(c => c.domain.replace(/^\./, ''))])];
            
            chrome.runtime.sendMessage({ action: "addMultipleToWhitelist", domains: domains });
            
            const btn = document.getElementById('excludeBtn');
            btn.innerText = "Added All!";
            btn.style.backgroundColor = "#4caf50";
            btn.style.color = "#000";
            setTimeout(() => { window.close(); }, 800);
        } catch (e) {
            // Ignore
        }
    });
});

// Manual Clean All
document.getElementById('cleanBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "triggerManualCleanup" }, (response) => {
        const btn = document.getElementById('cleanBtn');
        btn.innerText = "Cleaning...";
        btn.disabled = true;
        setTimeout(() => {
            btn.innerText = "Done!";
            setTimeout(() => { window.close(); }, 500);
        }, 800);
    });
});

// Options Page
document.getElementById('optionsBtn').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('options.html'));
    }
});