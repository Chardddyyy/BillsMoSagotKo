/**
 * BMSK BillsMoSagotKo - Security & Anti-Fraud Engine
 * Rate limiting, honeypot bot detection, XSS sanitization, anti-fake payment verification
 */

window.BMSK_SECURITY = (function () {
  'use strict';

  var LS_SECURITY_PREFIX = 'bmsk.sec.';

  /* Comprehensive XSS Sanitization */
  function sanitize(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/vbscript:/gi, '')
      .trim();
  }

  /* Rate Limiting & Cooldown Tracker */
  function checkRateLimit(action, maxAllowed, windowSeconds) {
    var key = LS_SECURITY_PREFIX + 'rl_' + action;
    var now = Date.now();
    var windowMs = windowSeconds * 1000;
    var logs = [];

    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Keep only timestamps within current sliding window
          logs = parsed.filter(function (ts) {
            return (now - ts) < windowMs;
          });
        }
      }
    } catch (e) {
      logs = [];
    }

    if (logs.length >= maxAllowed) {
      var oldest = logs[0];
      var waitSec = Math.ceil((windowMs - (now - oldest)) / 1000);
      return {
        allowed: false,
        waitSec: Math.max(1, waitSec)
      };
    }

    // Record this action
    logs.push(now);
    try {
      localStorage.setItem(key, JSON.stringify(logs));
    } catch (e) {}

    return {
      allowed: true,
      waitSec: 0
    };
  }

  /* Honeypot Bot Detector */
  function isBotDetected(honeypotElement) {
    if (!honeypotElement) return false;
    return Boolean(honeypotElement.value && honeypotElement.value.trim().length > 0);
  }

  /* Anti-Speed Script Check */
  function isTooFast(openedTimeMs, minAllowedMs) {
    if (!openedTimeMs) return false;
    var elapsed = Date.now() - openedTimeMs;
    return elapsed < (minAllowedMs || 2500);
  }

  /* Reference Number Duplicate Checker */
  function isDuplicateRef(ref, billsList, currentBillId) {
    if (!ref || !Array.isArray(billsList)) return false;
    var cleanInput = String(ref).replace(/[\s-]/g, '').toLowerCase();
    return billsList.some(function (b) {
      if (b.id === currentBillId) return false;
      if (!b.paidRef) return false;
      var existing = String(b.paidRef).replace(/[\s-]/g, '').toLowerCase();
      return existing === cleanInput;
    });
  }

  /* Receipt Image File Validator */
  function validateReceiptFile(file) {
    if (!file) {
      return { valid: false, error: 'e_receipt_required' };
    }

    // Must be a recognized image MIME type
    var validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (file.type && validTypes.indexOf(file.type.toLowerCase()) < 0) {
      return { valid: false, error: 'e_photo' };
    }

    // Maximum file size: 10 MB before client-side canvas compression
    if (file.size > 10 * 1024 * 1024) {
      return { valid: false, error: 'e_photo' };
    }

    return { valid: true };
  }

  /* ---------------- Anti-Inspect & DevTools Shield ---------------- */
  function initDevToolsProtection() {
    // 1. Block Context Menu (Inspect / View Page Source via Right-Click)
    document.addEventListener('contextmenu', function (e) {
      var tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        return; // Allow paste/select in text fields
      }
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, true);

    // 2. Block Inspect & Source Keyboard Shortcuts
    window.addEventListener('keydown', function (e) {
      var isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
      var cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      var key = e.key ? e.key.toUpperCase() : '';
      var keyCode = e.keyCode || e.which;

      // F12 (DevTools toggle)
      if (key === 'F12' || keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+Shift+I / Cmd+Option+I (Inspect Element)
      // Ctrl+Shift+J / Cmd+Option+J (Console)
      // Ctrl+Shift+C / Cmd+Option+C (Inspect Element Picker)
      if (
        (cmdOrCtrl && e.shiftKey && (key === 'I' || key === 'J' || key === 'C' || keyCode === 73 || keyCode === 74 || keyCode === 67)) ||
        (isMac && e.metaKey && e.altKey && (key === 'I' || key === 'J' || key === 'C' || keyCode === 73 || keyCode === 74 || keyCode === 67))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+U / Cmd+Option+U (View Page Source)
      if (
        (cmdOrCtrl && (key === 'U' || keyCode === 85)) ||
        (isMac && e.metaKey && e.altKey && (key === 'U' || keyCode === 85))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+S / Cmd+S (Save HTML file to disk)
      if (cmdOrCtrl && (key === 'S' || keyCode === 83)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true);

    // 3. Clear Console & Display Security Notice
    try {
      if (window.console) {
        console.clear();
        console.log('%cBMSK BillsMoSagotKo - Security Shield Active', 'font-size:18px; font-weight:800; color:#0F5C4D;');
        console.log('%cDirect inspection and developer modifications are restricted for anti-fraud protection and security integrity.', 'font-size:12px; color:#BA3E1D;');
      }
    } catch (err) {}

    // 4. Anti-Debugging execution trap (freezes inspection if DevTools is opened)
    setInterval(function () {
      try {
        (function () {
          return false;
        }['constructor']('debugger')());
      } catch (e) {}
    }, 1000);
  }

  /* ---------------- 3-Strikes Anti-Fraud & IP Blocking ---------------- */
  var cachedIp = '';

  function fetchClientIp() {
    try {
      var saved = localStorage.getItem(LS_SECURITY_PREFIX + 'client_ip');
      if (saved) cachedIp = saved;

      if (window.fetch) {
        fetch('https://api.ipify.org?format=json')
          .then(function (res) { return res.json(); })
          .then(function (resData) {
            if (resData && resData.ip) {
              cachedIp = resData.ip;
              try { localStorage.setItem(LS_SECURITY_PREFIX + 'client_ip', resData.ip); } catch (e) {}
              // Check if newly discovered IP is on the ban list
              if (isIpBanned(resData.ip)) {
                banCurrentDevice('Banned IP Address detected: ' + resData.ip);
              }
            }
          })
          .catch(function () {});
      }
    } catch (e) {}
  }

  function getBannedIps() {
    try {
      var raw = localStorage.getItem(LS_SECURITY_PREFIX + 'banned_ips');
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function isIpBanned(ip) {
    if (!ip) return false;
    var list = getBannedIps();
    return list.indexOf(ip) >= 0;
  }

  function getFraudRegistry() {
    try {
      var raw = localStorage.getItem(LS_SECURITY_PREFIX + 'fraud_registry');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveFraudRegistry(reg) {
    try {
      localStorage.setItem(LS_SECURITY_PREFIX + 'fraud_registry', JSON.stringify(reg));
    } catch (e) {}
  }

  function banCurrentDevice(reason) {
    try {
      localStorage.setItem(LS_SECURITY_PREFIX + 'is_banned', 'true');
      localStorage.setItem(LS_SECURITY_PREFIX + 'ban_reason', reason || 'Accumulated 3 strikes for fraudulent payment claims');
      localStorage.setItem(LS_SECURITY_PREFIX + 'banned_at', Date.now());
      if (cachedIp) {
        var bannedIps = getBannedIps();
        if (bannedIps.indexOf(cachedIp) < 0) {
          bannedIps.push(cachedIp);
          localStorage.setItem(LS_SECURITY_PREFIX + 'banned_ips', JSON.stringify(bannedIps));
        }
      }
    } catch (e) {}
    enforceBanUI();
  }

  function isUserBanned() {
    try {
      if (localStorage.getItem(LS_SECURITY_PREFIX + 'is_banned') === 'true') {
        return true;
      }
      var myStrikes = Number(localStorage.getItem(LS_SECURITY_PREFIX + 'my_strikes')) || 0;
      if (myStrikes >= 3) {
        return true;
      }
      if (cachedIp && isIpBanned(cachedIp)) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function recordFraudStrike(submitterId, gcashNum, billId) {
    var reg = getFraudRegistry();
    var myClientId = '';
    try { myClientId = localStorage.getItem('bmsk.client_id') || ''; } catch (e) {}

    var isMe = Boolean(submitterId && submitterId === myClientId);
    var strikeCount = 0;

    // Record by submitter ID
    if (submitterId) {
      reg[submitterId] = (reg[submitterId] || 0) + 1;
      strikeCount = Math.max(strikeCount, reg[submitterId]);
    }

    // Record by GCash Number
    if (gcashNum) {
      var gKey = 'g_' + String(gcashNum).replace(/[^0-9]/g, '');
      reg[gKey] = (reg[gKey] || 0) + 1;
      strikeCount = Math.max(strikeCount, reg[gKey]);
    }

    // Record by IP if present
    if (cachedIp) {
      var ipKey = 'ip_' + cachedIp;
      reg[ipKey] = (reg[ipKey] || 0) + 1;
      strikeCount = Math.max(strikeCount, reg[ipKey]);
    }

    saveFraudRegistry(reg);

    // If the penalized submitter is the current client (or in local dev/testing)
    if (isMe || !submitterId) {
      var myStrikes = (Number(localStorage.getItem(LS_SECURITY_PREFIX + 'my_strikes')) || 0) + 1;
      try { localStorage.setItem(LS_SECURITY_PREFIX + 'my_strikes', myStrikes); } catch (e) {}
      strikeCount = Math.max(strikeCount, myStrikes);
    }

    // Check 3-Strikes threshold
    if (strikeCount >= 3) {
      if (isMe || !submitterId) {
        banCurrentDevice('3 Fraudulent Payment Claims Reported');
      }
      if (cachedIp) {
        var bannedIps = getBannedIps();
        if (bannedIps.indexOf(cachedIp) < 0) {
          bannedIps.push(cachedIp);
          try { localStorage.setItem(LS_SECURITY_PREFIX + 'banned_ips', JSON.stringify(bannedIps)); } catch (e) {}
        }
      }
      return { strikes: strikeCount, banned: true };
    }

    return { strikes: strikeCount, banned: false };
  }

  function enforceBanUI() {
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', enforceBanUI);
      return;
    }

    if (document.getElementById('bmsk-ban-screen')) return;

    var i18n = window.BMSK_I18N;
    var t = function (k) { return (i18n && i18n.t) ? i18n.t(k) : k; };

    var myClientId = '';
    try { myClientId = localStorage.getItem('bmsk.client_id') || 'UID-' + Math.random().toString(36).substr(2, 8); } catch (e) {}
    var fingerprint = (cachedIp ? cachedIp + ' • ' : '') + myClientId;

    var overlay = document.createElement('div');
    overlay.id = 'bmsk-ban-screen';
    overlay.className = 'ban-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML =
      '<div class="ban-card">' +
        '<div class="ban-icon">🚫</div>' +
        '<h2>' + (t('ban_h') || 'ACCESS SUSPENDED / IP & DEVICE BLOCKED') + '</h2>' +
        '<div class="ban-tag">' + (t('ban_tag') || '3-Strikes Anti-Fraud Policy') + '</div>' +
        '<p>' + (t('ban_desc') || 'Your device and IP address have been permanently blocked for repeatedly submitting fake payment claims.') + '</p>' +
        '<div class="ban-details">' +
          '<div><span>Dahilan:</span> <b>' + (t('ban_reason') || '3 Fraudulent Claims Reported') + '</b></div>' +
          '<div><span>Katayuan:</span> <b style="color:var(--warn)">' + (t('ban_status') || 'Permanent Block') + '</b></div>' +
          '<div><span>' + (t('ban_fingerprint') || 'Fingerprint') + ':</span> <code>' + fingerprint + '</code></div>' +
        '</div>' +
        '<p class="ban-footer">' + (t('ban_footer') || 'This measure protects families in need against fake payment fraud.') + '</p>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.classList.add('lock');

    overlay.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    window.addEventListener('keydown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, true);
  }

  // Developer testing reset helper
  function resetBanForTesting() {
    try {
      localStorage.removeItem(LS_SECURITY_PREFIX + 'is_banned');
      localStorage.removeItem(LS_SECURITY_PREFIX + 'my_strikes');
      localStorage.removeItem(LS_SECURITY_PREFIX + 'fraud_registry');
      localStorage.removeItem(LS_SECURITY_PREFIX + 'banned_ips');
      localStorage.removeItem(LS_SECURITY_PREFIX + 'ban_reason');
      localStorage.removeItem(LS_SECURITY_PREFIX + 'banned_at');
    } catch (e) {}
    var el = document.getElementById('bmsk-ban-screen');
    if (el) el.remove();
    document.body.classList.remove('lock');
    console.log('%cBMSK: Ban and strikes reset for testing.', 'color:#1B834F; font-weight:bold;');
  }

  // Activate protection immediately upon script loading
  initDevToolsProtection();
  fetchClientIp();
  if (isUserBanned()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', enforceBanUI);
    } else {
      enforceBanUI();
    }
  }

  return {
    sanitize: sanitize,
    checkRateLimit: checkRateLimit,
    isBotDetected: isBotDetected,
    isTooFast: isTooFast,
    isDuplicateRef: isDuplicateRef,
    validateReceiptFile: validateReceiptFile,
    initDevToolsProtection: initDevToolsProtection,
    recordFraudStrike: recordFraudStrike,
    isUserBanned: isUserBanned,
    enforceBanUI: enforceBanUI,
    resetBanForTesting: resetBanForTesting
  };
})();

