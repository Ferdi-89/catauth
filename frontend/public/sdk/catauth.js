/**
 * Catauth Universal Web NFC & Hardware Identity SDK
 * Version: 1.0.0
 * (c) 2026 Catauth Sovereign Identity
 */
(function (global) {
  'use strict';

  // Automatically detect host domain or use default
  var currentScript = document.currentScript;
  var defaultBaseUrl = currentScript && currentScript.src 
    ? new URL(currentScript.src).origin 
    : 'https://catauth.vercel.app';

  var Catauth = {
    baseUrl: defaultBaseUrl,

    init: function (config) {
      if (config && config.baseUrl) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
      }
    },

    /**
     * Direct NFC Scan & Instant Login
     * @param {Object} options { linkId, clientId }
     * @returns {Promise<Object>} authData { success, authenticated, user, auth_token }
     */
    loginWithNFC: async function (options) {
      options = options || {};
      var self = this;

      if (!('NDEFReader' in window)) {
        // Fallback: Open Catauth Gateway Popup / Redirect
        return self._openAuthPopup(options);
      }

      return new Promise(async function (resolve, reject) {
        try {
          var NDEFReaderClass = window.NDEFReader;
          var ndef = new NDEFReaderClass();
          await ndef.scan();

          // Show floating scanner toast
          var toast = self._createScannerModal();

          ndef.onreadingerror = function () {
            self._removeScannerModal(toast);
            reject(new Error('Gagal membaca kartu NFC. Pastikan kartu ditempelkan dengan stabil.'));
          };

          ndef.onreading = async function (event) {
            self._removeScannerModal(toast);
            var serial = event.serialNumber;
            var rawUid = serial ? serial.replace(/:/g, '').toUpperCase() : 'UNKNOWN';
            var cardId = 'NFC-UID-' + rawUid;

            try {
              var res = await fetch(self.baseUrl + '/api/v1/auth/verify-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  card_id: cardId,
                  link_id: options.linkId,
                  client_id: options.clientId,
                  origin_url: window.location.href,
                }),
              });

              var data = await res.json();
              if (data.authenticated) {
                resolve(data);
              } else {
                reject(new Error(data.error ? data.error.message : 'Otentikasi kartu ditolak.'));
              }
            } catch (apiErr) {
              reject(apiErr);
            }
          };
        } catch (scanErr) {
          if (scanErr.name === 'NotAllowedError') {
            reject(new Error('Izin NFC ditolak pada browser.'));
          } else {
            // Fallback to popup if hardware NFC scan failed
            self._openAuthPopup(options).then(resolve).catch(reject);
          }
        }
      });
    },

    /**
     * Renders a stylish "Sign in with Catauth NFC" Button into target container
     * @param {string|HTMLElement} target Element selector or DOM node
     * @param {Object} options { linkId, theme, text, onSuccess, onError }
     */
    renderButton: function (target, options) {
      options = options || {};
      var el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return;

      var self = this;
      var theme = options.theme || 'dark';
      var labelText = options.text || 'Sign in with Catauth NFC';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'catauth-login-btn';
      btn.style.cssText = [
        'display: inline-flex',
        'align-items: center',
        'justify-content: center',
        'gap: 10px',
        'padding: 10px 20px',
        'border-radius: 8px',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size: 14px',
        'font-weight: 600',
        'cursor: pointer',
        'transition: all 0.2s ease',
        theme === 'light'
          ? 'background: #000; color: #fff; border: 1px solid #333;'
          : 'background: #fff; color: #000; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15);'
      ].join(';');

      btn.innerHTML = [
        '<svg viewBox="0 0 76 65" width="16" height="16" fill="currentColor"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg>',
        '<span>' + labelText + '</span>'
      ].join('');

      btn.onmouseover = function () {
        btn.style.transform = 'translateY(-1px)';
        btn.style.opacity = '0.9';
      };
      btn.onmouseout = function () {
        btn.style.transform = 'none';
        btn.style.opacity = '1';
      };

      btn.onclick = async function () {
        btn.disabled = true;
        var origText = btn.innerHTML;
        btn.innerHTML = '<span>Membuka Sensor NFC...</span>';

        try {
          var authData = await self.loginWithNFC(options);
          btn.innerHTML = '<span>✓ Terverifikasi!</span>';
          if (typeof options.onSuccess === 'function') {
            options.onSuccess(authData);
          }
        } catch (err) {
          btn.innerHTML = origText;
          btn.disabled = false;
          if (typeof options.onError === 'function') {
            options.onError(err);
          } else {
            alert(err.message || 'Login NFC gagal.');
          }
        }
      };

      el.innerHTML = '';
      el.appendChild(btn);
    },

    /**
     * Verifies token via Catauth Backend
     */
    verifyToken: async function (token) {
      var res = await fetch(this.baseUrl + '/api/v1/auth/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token }),
      });
      return await res.json();
    },

    _openAuthPopup: function (options) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var gatewayUrl = self.baseUrl + '/sso/login' + (options.linkId ? '?link_id=' + options.linkId : '');
        var popup = window.open(gatewayUrl, 'catauth_sso_popup', 'width=480,height=640,menubar=no,toolbar=no');
        
        if (!popup) {
          window.location.href = gatewayUrl;
          return;
        }

        var listener = function (event) {
          if (event.data && event.data.type === 'CATAUTH_AUTH_SUCCESS') {
            window.removeEventListener('message', listener);
            if (popup) popup.close();
            resolve(event.data.payload);
          }
        };
        window.addEventListener('message', listener);
      });
    },

    _createScannerModal: function () {
      var overlay = document.createElement('div');
      overlay.style.cssText = [
        'position: fixed',
        'inset: 0',
        'background: rgba(0,0,0,0.85)',
        'backdrop-filter: blur(8px)',
        'z-index: 999999',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'color: white',
        'font-family: -apple-system, sans-serif'
      ].join(';');

      overlay.innerHTML = [
        '<div style="background: #111; border: 1px solid #333; padding: 32px; border-radius: 16px; text-align: center; max-width: 320px;">',
        '<div style="font-size: 40px; margin-bottom: 16px; animation: pulse 1.5s infinite;">📲</div>',
        '<h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700;">Tempelkan Kartu NFC</h3>',
        '<p style="margin: 0; font-size: 13px; color: #888;">Dekatkan kartu e-Money / Flazz / e-KTP Anda ke belakang HP untuk login langsung.</p>',
        '</div>'
      ].join('');

      document.body.appendChild(overlay);
      return overlay;
    },

    _removeScannerModal: function (modal) {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }
  };

  // Export to global scope
  global.Catauth = Catauth;
})(typeof window !== 'undefined' ? window : this);
