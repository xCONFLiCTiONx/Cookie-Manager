// gpc.js - Injected into MAIN world at document_start to enable GPC and disable DNT
(function() {
    'use strict';

    // 1. Enable Global Privacy Control (GPC)
    try {
        if (typeof Navigator !== 'undefined' && Navigator.prototype) {
            Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
                get: function() { return true; },
                configurable: true,
                enumerable: true
            });
        }
    } catch (e) {}

    try {
        if (typeof navigator !== 'undefined') {
            if (!('globalPrivacyControl' in navigator) || navigator.globalPrivacyControl !== true) {
                Object.defineProperty(navigator, 'globalPrivacyControl', {
                    value: true,
                    writable: false,
                    configurable: true,
                    enumerable: true
                });
            }
        }
    } catch (e) {}

    // 2. Disable Do Not Track (DNT) in JS DOM
    try {
        if (typeof Navigator !== 'undefined' && Navigator.prototype) {
            Object.defineProperty(Navigator.prototype, 'doNotTrack', {
                get: function() { return undefined; },
                configurable: true,
                enumerable: true
            });
        }
    } catch (e) {}

    try {
        if (typeof navigator !== 'undefined') {
            Object.defineProperty(navigator, 'doNotTrack', {
                get: function() { return undefined; },
                configurable: true,
                enumerable: true
            });
        }
    } catch (e) {}

    try {
        if (typeof window !== 'undefined') {
            Object.defineProperty(window, 'doNotTrack', {
                get: function() { return undefined; },
                configurable: true,
                enumerable: true
            });
        }
    } catch (e) {}
})();
