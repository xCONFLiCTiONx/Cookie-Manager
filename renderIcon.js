// renderIcon.js
function renderIcon() {
    function updateTheme() {
        const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

        // Tell background script to update the extension toolbar icon
        chrome.runtime.sendMessage({ action: "updateIcon", isDarkMode });
    }

    // Run on load and listen for theme shifts
    updateTheme();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateTheme);
}