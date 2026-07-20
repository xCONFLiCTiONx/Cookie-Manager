document.getElementById('excludeBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        const tab = tabs[0];
        const cookies = await chrome.cookies.getAll({ url: tab.url });
        const domains = [...new Set(cookies.map(c => c.domain.replace(/^\./, '')))];
        
        chrome.runtime.sendMessage({ action: "addMultipleToWhitelist", domains: domains });
        
        const btn = document.getElementById('excludeBtn');
        btn.innerText = "Added All!";
        btn.style.backgroundColor = "#4caf50";
        setTimeout(() => { window.close(); }, 800);
    });
});

document.getElementById('optionsBtn').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('options.html'));
    }
});