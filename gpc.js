// gpc.js - Injected into MAIN world at document_start to set navigator.globalPrivacyControl
(function() {
    'use strict';

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
})();
