const textarea = document.getElementById('whitelist');
const saveBtn = document.getElementById('save');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const fileInput = document.getElementById('fileInput');

function normalizeDomain(domain) {
    domain = domain.trim().toLowerCase();

    if (!domain) return null;

    // Remove protocol
    domain = domain.replace(/^https?:\/\//, '');

    // Remove wildcard if already present
    domain = domain.replace(/^\*\./, '');

    // Remove path/query/hash
    domain = domain.split('/')[0];
    domain = domain.split('?')[0];
    domain = domain.split('#')[0];

    // Remove port
    domain = domain.split(':')[0];

    // Remove leading www.
    domain = domain.replace(/^www\./, '');

    return '*.' + domain;
}

// Load current data
chrome.storage.local.get(['HiddenElements'], (res) => {
    textarea.value = (res.HiddenElements || []).join('\n');
});

// Save logic
saveBtn.addEventListener('click', () => {
    const list = [...new Set(
        textarea.value
            .split('\n')
            .map(normalizeDomain)
            .filter(Boolean)
    )].sort();

    textarea.value = list.join('\n');

    chrome.storage.local.set({ HiddenElements: list }, () => {
        saveBtn.innerText = "Saved!";
        setTimeout(() => {
            saveBtn.innerText = "Save List";
        }, 1000);
    });
});

// Export Logic
exportBtn.addEventListener('click', () => {
    const blob = new Blob([textarea.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'whitelist.txt';
    a.click();

    URL.revokeObjectURL(url);
});

// Import Logic
importBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
        const list = [...new Set(
            event.target.result
                .split('\n')
                .map(normalizeDomain)
                .filter(Boolean)
        )].sort();

        textarea.value = list.join('\n');
        saveBtn.click();
    };

    reader.readAsText(file);
});