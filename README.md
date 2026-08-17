# Cookie Manager

A productivity and privacy extension that automatically manages your browser session by wiping site-specific storage and cookies the moment you close a tab.

## 🚀 Overview

**Cookie Manager** takes the manual work out of session privacy. By whitelisting only the sites you trust, the extension ensures that tracking data, unwanted cookies, and local storage from other sites are purged automatically when you finish your browsing session.

## ✨ Key Features

- **Automated Cleanup**: Triggers data removal immediately upon closing a tab.
- **Smart Whitelisting**: Use a high-performance `Set`-based lookup to protect essential login cookies for your favorite sites.
- **Manual "Clean All"**: One-click button in the popup to wipe all unwhitelisted data across all open sessions.
- **Comprehensive Purge**: Wipes cookies, local storage, session storage, and other site-specific data.
- **Debounced Processing**: Efficient background service worker handles cleanup without impacting browser performance.
- **Visual Status**: Real-time feedback in the popup UI.

## 🛠️ Installation

1. Download the extension source.
2. Open Chrome and go to `chrome://extensions/`.
3. Toggle **Developer mode** to ON.
4. Click **Load unpacked** and choose the extension folder.

## 📖 How it Works

1. **Whitelisting**: Add domains to your whitelist in the extension options.
2. **Browsing**: Browse the web normally.
3. **Purging**: When you close a tab, the extension checks if the domain is whitelisted. If not, it wipes all associated data for that site.
4. **Manual Mode**: Use the **Clean All** button in the popup for an emergency session reset.

## 🛡️ Privacy Focus

- Works entirely on the client-side using the `chrome.browsingData` and `chrome.cookies` APIs.
- No browsing history or cookie data is ever transmitted to external servers.

---
*Your session, your rules.*
