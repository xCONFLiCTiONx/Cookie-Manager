const textarea = document.getElementById('whitelist');
const saveBtn = document.getElementById('save');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const fileInput = document.getElementById('fileInput');

// Load current data
chrome.storage.local.get(['HiddenElements'], (res) => {
    textarea.value = (res.HiddenElements || []).join('\n');
});

// Save logic
saveBtn.addEventListener('click', () => {
    const list = textarea.value.split('\n').filter(line => line.trim() !== '');
    chrome.storage.local.set({ HiddenElements: list }, () => {
        saveBtn.innerText = "Saved!";
        setTimeout(() => saveBtn.innerText = "Save List", 1000);
    });
});

// Export Logic: Creates a .txt file and triggers browser download
exportBtn.addEventListener('click', () => {
    const blob = new Blob([textarea.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'whitelist.txt';
    a.click();
});

// Import Logic: Opens file dialog
importBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        textarea.value = event.target.result;
        saveBtn.click(); // Automatically save the imported list
    };
    reader.readAsText(file);
});