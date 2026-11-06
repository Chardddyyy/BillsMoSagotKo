/**
 * BMSK BillsMoSagotKo - Core Application Logic
 * State management, views rendering, modal interactions, event dispatching
 */

(function () {
  'use strict';

  var i18n = window.BMSK_I18N;
  var data = window.BMSK_DATA;

  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* Application State */
  var S = {
    bills: [],
    mode: 'connecting',
    canWrite: true,
    myId: '',
    db: null,
    coll: null,
    unsub: null,
    loadTimer: 0,
    stale: false,
    ftype: 'all',
    fsort: 'due',
    q: '',
    ccat: 'all',
    cq: '',
    payBill: null,
    payDonor: null,
    giveCh: null,
    giveAmt: 0
  };

  var security = window.BMSK_SECURITY;
  var payModalOpenTime = 0;
  var postModalOpenTime = 0;
  var armedBillId = null;
  var armedReopenId = null;
  var armedConfirmId = null;
  var armedRejectId = null;

  /* ---------------- Requester Identity & Ownership ---------------- */
  function getMyClientId() {
    var id = data.LS.get('bmsk.client_id');
    if (!id) {
      id = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
      data.LS.set('bmsk.client_id', id);
    }
    return id;
  }

  function getMyBillIds() {
    try {
      var raw = data.LS.get('bmsk.my_bills');
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function recordMyBill(billId) {
    if (!billId) return;
    var list = getMyBillIds();
    if (list.indexOf(billId) < 0) {
      list.push(billId);
      data.LS.set('bmsk.my_bills', JSON.stringify(list));
    }
  }

  function isBillOwner(b) {
    if (!b) return false;
    var myClientId = getMyClientId();
    var myBillIds = getMyBillIds();
    if (myBillIds.indexOf(b.id) >= 0) return true;
    if (b.ownerId && (b.ownerId === myClientId || (S.myId && b.ownerId === S.myId))) return true;
    return false;
  }

  /* ---------------- Theme Controller ---------------- */
  var THEME_ICONS = {
    light: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>',
    dark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>'
  };

  function getSystemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  var curTheme = data.LS.get(data.LKEY_THEME);
  if (curTheme !== 'light' && curTheme !== 'dark') {
    curTheme = getSystemTheme();
  }

  function applyTheme() {
    var doc = document.documentElement;
    doc.setAttribute('data-theme', curTheme);

    var btn = $('#theme-btn');
    if (btn) {
      // Show sun icon in dark mode (click for light), moon icon in light mode (click for dark)
      var targetIcon = curTheme === 'dark' ? THEME_ICONS.light : THEME_ICONS.dark;
      btn.innerHTML = targetIcon;
      var lbl = i18n.t('theme_' + curTheme);
      btn.setAttribute('aria-label', lbl);
      btn.title = lbl + ' - Click to toggle';
    }
  }

  function toggleTheme() {
    // 1-Click Instant Toggle: switches directly between light and dark
    curTheme = curTheme === 'dark' ? 'light' : 'dark';
    data.LS.set(data.LKEY_THEME, curTheme);
    applyTheme();
  }

  /* ---------------- Language Controller ---------------- */
  function applyLang() {
    var lang = i18n.getLang();
    document.documentElement.lang = lang === 'fil' ? 'fil' : 'en';

    $$('[data-i18n]').forEach(function (el) {
      el.textContent = i18n.t(el.getAttribute('data-i18n'));
    });
    $$('[data-i18n-ph]').forEach(function (el) {
      el.placeholder = i18n.t(el.getAttribute('data-i18n-ph'));
    });
    $$('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', i18n.t(el.getAttribute('data-i18n-aria')));
    });

    var heroTitle = $('#hero-h');
    if (heroTitle) {
      heroTitle.innerHTML = i18n.t('hero_h');
    }

    var enBtn = $('#lang-en');
    var filBtn = $('#lang-fil');
    if (enBtn) enBtn.setAttribute('aria-pressed', String(lang === 'en'));
    if (filBtn) filBtn.setAttribute('aria-pressed', String(lang === 'fil'));

    fillSelects();
    fillList('#how-a', i18n.t('how_a'));
    fillList('#how-b', i18n.t('how_b'));
    fillList('#how-c', i18n.t('how_c'));

    applyTheme();
    renderAll();

    if ($('#m-pay') && !$('#m-pay').hidden) renderPay();
    if ($('#m-give') && !$('#m-give').hidden) renderGive();
  }

  function fillList(selector, items) {
    var el = $(selector);
    if (!el || !Array.isArray(items)) return;
    el.innerHTML = items.map(function (txt) {
      return '<li>' + data.esc(txt) + '</li>';
    }).join('');
  }

  function typeOptions(withAll) {
    var html = withAll ? '<option value="all">' + data.esc(i18n.t('all_types')) + '</option>' : '';
    return html + data.TYPES.map(function (k) {
      return '<option value="' + k + '">' + data.esc(i18n.t('ty_' + k)) + '</option>';
    }).join('');
  }

  function fillSelects() {
    var ft = $('#ftype');
    var fs = $('#fsort');
    var pt = $('#p-type');

    var curType = (ft && ft.value) || 'all';
    var curSort = (fs && fs.value) || 'due';
    var curPType = (pt && pt.value) || 'electricity';

    if (ft) {
      ft.innerHTML = typeOptions(true);
      ft.value = curType;
    }
    if (fs) {
      fs.innerHTML =
        '<option value="due">' + data.esc(i18n.t('s_due')) + '</option>' +
        '<option value="due_desc">' + data.esc(i18n.t('s_due_desc')) + '</option>' +
        '<option value="new">' + data.esc(i18n.t('s_new')) + '</option>' +
        '<option value="old">' + data.esc(i18n.t('s_old')) + '</option>' +
        '<option value="low">' + data.esc(i18n.t('s_low')) + '</option>' +
        '<option value="high">' + data.esc(i18n.t('s_high')) + '</option>';
      fs.value = curSort;
    }
    if (pt) {
      pt.innerHTML = typeOptions(false);
      pt.value = curPType;
    }
  }

  /* ---------------- Routing Controller ---------------- */
  function route(isTabClick) {
    var h = (location.hash || '#bills').replace('#', '');
    if (['bills', 'charities', 'how'].indexOf(h) < 0) h = 'bills';

    ['bills', 'charities', 'how'].forEach(function (k) {
      var view = $('#v-' + k);
      if (view) {
        view.hidden = k !== h;
        if (k === h) {
          view.classList.remove('view-active');
          void view.offsetWidth;
          view.classList.add('view-active');
        }
      }
    });

    $$('[data-tab]').forEach(function (tabLink) {
      if (tabLink.getAttribute('data-tab') === h) {
        tabLink.setAttribute('aria-current', 'page');
      } else {
        tabLink.removeAttribute('aria-current');
      }
    });

    // Bring the newly active section into clear view so the user immediately sees the content change
    var targetSec = $('#v-' + h);
    if (targetSec && (h !== 'bills' || isTabClick || window.pageYOffset > 120)) {
      var topNav = $('.top');
      var tabsNav = $('.tabs');
      var offset = (topNav ? topNav.offsetHeight : 54) + (tabsNav ? tabsNav.offsetHeight : 44) + 16;
      var targetY = targetSec.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    }
  }

  /* ---------------- Bills Filtering & Rendering ---------------- */
  function getVisibleBills() {
    var query = S.q.trim().toLowerCase();
    var list = S.bills.filter(function (b) {
      if (S.ftype !== 'all' && b.type !== S.ftype) return false;
      if (query) {
        var haystack = ((b.biller || '') + ' ' + (b.story || '')).toLowerCase();
        if (haystack.indexOf(query) < 0) return false;
      }
      return true;
    });

    list.sort(function (a, b) {
      // Priority rank: 0 = open, 1 = pending_verification, 2 = paid
      var rankA = a.status === 'paid' ? 2 : (a.status === 'pending_verification' ? 1 : 0);
      var rankB = b.status === 'paid' ? 2 : (b.status === 'pending_verification' ? 1 : 0);
      if (rankA !== rankB) return rankA - rankB;

      if (S.fsort === 'new') return (b.createdAt || 0) - (a.createdAt || 0);
      if (S.fsort === 'old') return (a.createdAt || 0) - (b.createdAt || 0);
      if (S.fsort === 'low') return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      if (S.fsort === 'high') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (S.fsort === 'due_desc') return String(b.due || '').localeCompare(String(a.due || ''));
      // default: soonest due date first
      return String(a.due || '9999').localeCompare(String(b.due || '9999'));
    });

    return list;
  }

  function renderStats() {
    var el = $('#stats');
    if (!el) return;

    var openBills = S.bills.filter(function (b) { return b.status === 'open'; });
    var pendingBills = S.bills.filter(function (b) { return b.status === 'pending_verification'; });
    var paidBills = S.bills.filter(function (b) { return b.status === 'paid'; });
    var totalNeeded = openBills.reduce(function (sum, b) { return sum + (Number(b.amount) || 0); }, 0);

    el.innerHTML =
      '<div><b>' + openBills.length + '</b><span>' + data.esc(i18n.t('st_open')) + '</span></div>' +
      (pendingBills.length > 0 ? '<div><b>' + pendingBills.length + '</b><span>' + data.esc(i18n.t('st_pending')) + '</span></div>' : '') +
      '<div><b>' + data.esc(data.money(totalNeeded)) + '</b><span>' + data.esc(i18n.t('st_amt')) + '</span></div>' +
      '<div><b>' + paidBills.length + '</b><span>' + data.esc(i18n.t('st_paid')) + '</span></div>';

    var noteEl = $('#mode-note');
    if (noteEl) {
      var msg = '';
      if (S.mode === 'connecting') msg = i18n.t('note_load');
      else if (S.mode === 'local') msg = i18n.t('note_local');
      else if (!S.canWrite) msg = i18n.t('note_ro');
      else if (S.stale) msg = i18n.t('note_slow');

      noteEl.hidden = !msg;
      noteEl.textContent = msg;
    }
  }

  function renderBills() {
    var container = $('#bills');
    if (!container) return;

    var list = getVisibleBills();
    if (!list.length) {
      var hasFilter = S.bills.length > 0;
      container.innerHTML =
        '<div class="empty" style="grid-column: 1 / -1;">' +
        '<h3>' + data.esc(hasFilter ? i18n.t('empty_f') : i18n.t('empty_h')) + '</h3>' +
        (hasFilter ? '' : '<p>' + data.esc(i18n.t('empty_p')) + '</p><button type="button" class="btn primary" data-action="post">' + data.esc(i18n.t('cta_post')) + '</button>') +
        '</div>';
      return;
    }

    var lang = i18n.getLang();

    container.innerHTML = list.map(function (b) {
      var isPaid = b.status === 'paid';
      var isPending = b.status === 'pending_verification';
      var d = b.due ? data.daysUntil(b.due) : null;
      var statusPill = '';

      if (isPaid) {
        statusPill = '<span class="pill verified">' + data.esc(i18n.t('verified_paid')) + '</span>';
      } else if (isPending) {
        statusPill = '<span class="pill pending">' + data.esc(i18n.t('pending_verification')) + '</span>';
      } else if (d !== null && d < 0) {
        statusPill = '<span class="pill warn">' + data.esc(i18n.t('overdue')) + '</span>';
      } else if (d !== null && d <= 3) {
        statusPill = '<span class="pill warn">' + data.esc(i18n.t('soon')) + '</span>';
      } else {
        statusPill = '<span class="pill muted">' + data.esc(i18n.t('open')) + '</span>';
      }

      var requesterName = b.anon || !b.name ? i18n.t('anon') : b.name;
      var billPhoto = data.safeImg(b.img);
      var isMine = isBillOwner(b);

      // Pending Verification Alert Block
      var pendingBlockHtml = '';
      if (isPending) {
        var submitterName = b.paidAnon || !b.paidBy ? i18n.t('anon') : b.paidBy;
        var receiptThumb = b.paidReceipt
          ? '<button type="button" class="thumb" data-action="view-receipt" data-id="' + data.esc(b.id) + '"><img src="' + data.safeImg(b.paidReceipt) + '" alt=""><span>' + data.esc(i18n.t('view_receipt')) + '</span></button>'
          : '';
        var refInfo = b.paidRef
          ? '<div class="paid-ref-row"><span>' + data.esc(i18n.t('k_account')) + ' (Ref):</span><code class="paid-ref-code">' + data.esc(b.paidRef) + '</code></div>'
          : '';

        if (isMine) {
          // Requester View: ONLY the person who posted the bill can verify or decline!
          pendingBlockHtml =
            '<div class="pending-alert-box owner-alert">' +
              '<div style="display:flex; align-items:center; gap:6px;"><b>⚠️ ' + data.esc(i18n.t('pending_owner_title')) + '</b></div>' +
              '<p style="margin:0; font-size:0.84rem;">' + data.esc(i18n.t('pending_owner_desc')) + '</p>' +
              '<div style="font-size:0.84rem;">' + data.esc(i18n.t('paid_by')) + ': <b>' + data.esc(submitterName) + '</b></div>' +
              refInfo +
              receiptThumb +
              '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">' +
                '<button type="button" class="btn primary small" data-action="confirm-paid" data-id="' + data.esc(b.id) + '">' +
                  data.esc(armedConfirmId === b.id ? i18n.t('confirm_paid_re') : i18n.t('confirm_paid')) +
                '</button>' +
                '<button type="button" class="btn small btn-reopen" data-action="reject-proof" data-id="' + data.esc(b.id) + '">' +
                  data.esc(armedRejectId === b.id ? i18n.t('reject_confirm') : i18n.t('reject_proof')) +
                '</button>' +
              '</div>' +
            '</div>';
        } else {
          // Public / Donor View: Visitors can see status & receipt, but CANNOT verify or decline!
          pendingBlockHtml =
            '<div class="pending-alert-box public-alert">' +
              '<div style="display:flex; align-items:center; gap:6px;"><b>⏳ ' + data.esc(i18n.t('pending_verification')) + '</b></div>' +
              '<p style="margin:0; font-size:0.84rem;">' + data.esc(i18n.t('pending_public_desc')) + '</p>' +
              '<div style="font-size:0.84rem;">' + data.esc(i18n.t('paid_by')) + ': <b>' + data.esc(submitterName) + '</b></div>' +
              refInfo +
              receiptThumb +
              '<div style="font-size:0.8rem; color:var(--muted); font-style:italic; margin-top:4px;">' +
                '🔒 ' + data.esc(i18n.t('pending_only_owner_can_verify')) +
              '</div>' +
            '</div>';
        }
      }

      // Verified Payment Block
      var paidBlockHtml = '';
      if (isPaid) {
        var donorName = b.paidAnon || !b.paidBy ? i18n.t('anon') : b.paidBy;
        var refRow = b.paidRef
          ? '<div class="paid-ref-row"><span>' + data.esc(i18n.t('k_account')) + ' (Ref):</span><code class="paid-ref-code">' + data.esc(b.paidRef) + '</code></div>'
          : '';
        var receiptBtn = b.paidReceipt
          ? '<button type="button" class="thumb" data-action="view-receipt" data-id="' + data.esc(b.id) + '"><img src="' + data.safeImg(b.paidReceipt) + '" alt=""><span>' + data.esc(i18n.t('view_receipt')) + '</span></button>'
          : '';

        paidBlockHtml =
          '<div class="paid-block">' +
            '<p class="by">' + data.esc(i18n.t('paid_by')) + ': <b>' + data.esc(donorName) + '</b></p>' +
            refRow +
            receiptBtn +
            (isMine ? '<div>' +
              '<button type="button" class="btn small btn-reopen" data-action="reopen" data-id="' + data.esc(b.id) + '">' +
                data.esc(armedReopenId === b.id ? i18n.t('reopen_confirm') : i18n.t('reopen_bill')) +
              '</button>' +
            '</div>' : '') +
          '</div>';
      }

      return (
        '<article class="bill' + (isPaid ? ' paid' : (isPending ? ' pending' : '')) + '" data-id="' + data.esc(b.id) + '">' +
          '<div class="stub">' +
            '<div class="row">' +
              '<span class="chip">' + data.esc(i18n.t('ty_' + (data.TYPES.indexOf(b.type) < 0 ? 'other' : b.type))) + '</span>' +
              statusPill +
              (b.sample ? '<span class="pill muted">' + data.esc(i18n.t('sample')) + '</span>' : '') +
            '</div>' +
            '<div class="amt">' + data.esc(data.money(b.amount)) + '</div>' +
            '<div class="biller">' + data.esc(b.biller) + '</div>' +
          '</div>' +
          '<div class="perf"></div>' +
          '<div class="bbody">' +
            '<div class="due"><span>' + data.esc(i18n.t('due')) + ' ' + data.esc(data.fdate(b.due, lang)) + '</span></div>' +
            (b.story ? '<p class="story">' + data.esc(b.story) + '</p>' : '') +
            (billPhoto ? '<button type="button" class="thumb" data-action="photo" data-id="' + data.esc(b.id) + '"><img src="' + billPhoto + '" alt=""><span>' + data.esc(i18n.t('photo')) + '</span></button>' : '') +
            '<p class="by">' + data.esc(i18n.t('posted_by')) + ': ' + data.esc(requesterName) + '</p>' +
            pendingBlockHtml +
            paidBlockHtml +
            '<div class="actions">' +
              (isPaid || isPending ? '' : '<button type="button" class="btn primary small" data-action="pay" data-id="' + data.esc(b.id) + '">' + data.esc(i18n.t('pay_btn')) + '</button>') +
              (isMine && !isPaid ? '<button type="button" class="btn small" data-action="remove" data-id="' + data.esc(b.id) + '">' + data.esc(armedBillId === b.id ? i18n.t('remove2') : i18n.t('remove')) + '</button>' : '') +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  /* ---------------- Charities Rendering ---------------- */
  function renderCharities() {
    var chipsContainer = $('#cchips');
    if (chipsContainer) {
      chipsContainer.innerHTML = data.CCATS.map(function (c) {
        return (
          '<button type="button" class="chip-btn" data-action="ccat" data-cat="' + c + '" aria-pressed="' + (S.ccat === c) + '">' +
            data.esc(i18n.t('c_' + c)) +
          '</button>'
        );
      }).join('');
    }

    var listEl = $('#charities');
    if (!listEl) return;

    var query = S.cq.trim().toLowerCase();
    var lang = i18n.getLang();

    var filtered = data.CHARITIES.filter(function (c) {
      var matchCategory = S.ccat === 'all' || c.cat === S.ccat;
      if (!matchCategory) return false;
      if (query) {
        var str = (c.name + ' ' + c.en + ' ' + c.fil).toLowerCase();
        if (str.indexOf(query) < 0) return false;
      }
      return true;
    });

    if (!filtered.length) {
      listEl.innerHTML = '<div class="empty" style="grid-column: 1 / -1;"><h3>' + data.esc(i18n.t('empty_f')) + '</h3></div>';
      return;
    }

    listEl.innerHTML = filtered.map(function (c) {
      return (
        '<article class="ch">' +
          '<div class="row"><span class="chip">' + data.esc(i18n.t('c_' + c.cat)) + '</span></div>' +
          '<h3>' + data.esc(c.name) + '</h3>' +
          '<p>' + data.esc(c[lang] || c.en) + '</p>' +
          '<div class="links">' +
            '<button type="button" class="btn primary small" data-action="give" data-id="' + c.id + '">' + data.esc(i18n.t('give_btn')) + '</button>' +
            '<a class="btn small" href="' + data.esc(c.url) + '" target="_blank" rel="noopener">' + data.esc(i18n.t('site')) + '</a>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function renderAll() {
    renderStats();
    renderBills();
    renderCharities();
  }

  /* ---------------- Data Layer & Storage ---------------- */
  function loadLocal() {
    var raw = data.LS.get(data.LKEY_BILLS);
    var arr = null;
    try {
      arr = raw ? JSON.parse(raw) : null;
    } catch (e) {}

    if (Array.isArray(arr)) {
      // Cleanly filter out all dummy and sample bills
      arr = arr.filter(function (b) {
        return b && !b.sample && !/^s[0-9]+$/.test(String(b.id || ''));
      });
    } else {
      arr = [];
    }
    S.bills = arr;
    saveLocal();
  }

  function saveLocal() {
    data.LS.set(data.LKEY_BILLS, JSON.stringify(S.bills));
  }

  function startLocal() {
    if (S.mode === 'shared') return;
    S.mode = 'local';
    S.canWrite = true;
    S.myId = '';
    loadLocal();
    renderAll();
  }

  function startShared(db, user) {
    S.mode = 'shared';
    S.db = db;
    S.coll = db.collection('bills');
    renderAll();

    Promise.resolve(user && user.can ? user.can('data.write') : null)
      .then(function (v) {
        S.canWrite = v !== false;
        renderStats();
      })
      .catch(function () {});

    Promise.resolve(user && user.id ? user.id() : null)
      .then(function (v) {
        S.myId = v || '';
        renderBills();
      })
      .catch(function () {});

    S.bills = [];
    S.stale = false;
    clearTimeout(S.loadTimer);
    S.loadTimer = setTimeout(function () {
      S.stale = true;
      renderStats();
    }, 10000);

    S.unsub = S.coll.orderBy('createdAt', 'desc').limit(300).onSnapshot(
      function (snap) {
        S.bills = snap.docs.map(function (d) {
          var item = d.data() || {};
          item.id = d.id;
          return item;
        });
        if (!snap.metadata.fromCache) {
          clearTimeout(S.loadTimer);
          S.stale = false;
        }
        renderAll();
      },
      function () {
        clearTimeout(S.loadTimer);
        S.stale = false;
        renderAll();
      }
    );
  }

  function boot() {
    var cl = window.claude;
    var decided = false;
    S.loadTimer = 0;

    if (!cl || !cl.use) {
      startLocal();
      return;
    }

    var fallbackTimer = setTimeout(function () {
      if (!decided) startLocal();
    }, 3000);

    Promise.all([
      cl.use('db').catch(function () { return null; }),
      cl.use('user').catch(function () { return null; })
    ]).then(function (results) {
      decided = true;
      clearTimeout(fallbackTimer);
      if (results[0]) startShared(results[0], results[1]);
      else startLocal();
    });
  }

  /* ---------------- Modal & Toast Helpers ---------------- */
  var lastFocusElement = null;

  function openModal(id) {
    lastFocusElement = document.activeElement;
    var modal = $(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('lock');

    var focusTarget = $('input, select, textarea, button.btn, a.btn', modal);
    if (focusTarget) {
      setTimeout(function () {
        try { focusTarget.focus(); } catch (e) {}
      }, 50);
    }
  }

  function closeModals() {
    $$('.modal').forEach(function (m) {
      m.hidden = true;
    });
    document.body.classList.remove('lock');
    if (lastFocusElement && lastFocusElement.focus) {
      try { lastFocusElement.focus(); } catch (e) {}
    }
  }

  var toastTimer = 0;
  function showToast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.hidden = true;
    }, 3200);
  }

  function getBillById(id) {
    return S.bills.filter(function (b) { return b.id === id; })[0];
  }

  function kvRow(label, val) {
    return (
      '<div>' +
        '<span><small>' + data.esc(label) + '</small><code>' + data.esc(val) + '</code></span>' +
        '<button type="button" class="btn small" data-action="copy" data-val="' + data.esc(val) + '">' +
          data.esc(i18n.t('copy')) +
        '</button>' +
      '</div>'
    );
  }

  /* ---------------- Post Bill Workflow ---------------- */
  function openPostModal() {
    if (security && security.isUserBanned()) {
      security.enforceBanUI();
      return;
    }
    if (S.mode === 'shared' && !S.canWrite) {
      showToast(i18n.t('e_write'));
      return;
    }
    postModalOpenTime = Date.now();
    $('#f-post').reset();
    $('#p-err').textContent = '';
    $('#p-due').min = data.today();
    $('#p-due').value = data.addDays(7);

    var d = data.donorPrefs();
    if (d.name) $('#p-name').value = d.name;

    fillSelects();
    openModal('#m-post');
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var blobUrl = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function () {
        var maxDim = 1000;
        var quality = 0.72;
        var resultDataUrl = '';

        for (var step = 0; step < 6; step++) {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));

          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          resultDataUrl = canvas.toDataURL('image/jpeg', quality);
          if (resultDataUrl.length < 175000) break;
          maxDim = Math.round(maxDim * 0.8);
          quality = Math.max(0.38, quality - 0.08);
        }

        URL.revokeObjectURL(blobUrl);
        if (resultDataUrl.length < 240000) {
          resolve(resultDataUrl);
        } else {
          reject(new Error('big'));
        }
      };

      img.onerror = function () {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('read'));
      };

      img.src = blobUrl;
    });
  }

  /* ---------------- Pay Bill Workflow ---------------- */
  function openPayModal(id) {
    if (security && security.isUserBanned()) {
      security.enforceBanUI();
      return;
    }
    var b = getBillById(id);
    if (!b) return;
    payModalOpenTime = Date.now();
    S.payBill = b;
    S.payDonor = null;

    var d = data.donorPrefs();
    var hasProfile = Boolean(d.gcash && data.gcashOk(data.cleanGcash(d.gcash)));

    $('#d-name').value = d.name || '';
    $('#d-gcash').value = d.gcash || '';
    $('#d-anon').checked = false;
    $('#d-err').textContent = '';
    $('#paid-err').textContent = '';
    $('#d-ref').value = '';
    var certBox = $('#d-certify');
    if (certBox) certBox.checked = false;
    var receiptFile = $('#d-receipt');
    if (receiptFile) receiptFile.value = '';

    renderPay();

    // 1-Click Pay: If donor already has their GCash profile saved, jump directly to GCash payment step
    if (hasProfile && d.quickPay !== false) {
      S.payDonor = { name: d.name || '', anon: !d.name, gcash: d.gcash };

      // Automatically copy the account number to donor's clipboard for 1-click convenience
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(b.account);
          showToast(i18n.t('acct_copied'));
        }
      } catch (e) {}

      $('#pay-a').hidden = true;
      $('#pay-b').hidden = false;
    } else {
      $('#pay-a').hidden = false;
      $('#pay-b').hidden = true;
    }

    openModal('#m-pay');
  }

  function renderPay() {
    var b = S.payBill;
    if (!b) return;

    $('#pay-title').textContent = i18n.t('pay_h');
    $('#pay-sub').textContent = i18n.t('pay_sub');

    $('#pay-kv').innerHTML =
      kvRow(i18n.t('k_biller'), b.biller) +
      kvRow(i18n.t('k_account'), b.account) +
      kvRow(i18n.t('k_amount'), data.money(b.amount));

    $('#pay-steps').innerHTML = ['ps_1', 'ps_2', 'ps_3', 'ps_4'].map(function (k) {
      return '<li>' + data.esc(i18n.t(k)) + '</li>';
    }).join('');

    // Setup direct GCash app launch
    var gcashBtn = $('#open-gcash-btn');
    if (gcashBtn) {
      gcashBtn.onclick = function (e) {
        var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
          var startTime = Date.now();
          window.location.href = 'gcash://';
          setTimeout(function () {
            if (Date.now() - startTime < 1600) {
              window.open('https://www.gcash.com/', '_blank');
            }
          }, 900);
          e.preventDefault();
        }
      };
    }
  }

  /* ---------------- Give to Charity Workflow ---------------- */
  var CHARITY_PRESET_AMOUNTS = [50, 100, 500, 1000, 5000];

  function openGiveModal(id) {
    var c = data.CHARITIES.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    S.giveCh = c;
    S.giveAmt = 0;

    var d = data.donorPrefs();
    $('#g-name').value = d.name || '';
    $('#g-gcash').value = d.gcash || '';
    $('#g-anon').checked = false;
    $('#g-amount').value = '';
    $('#g-err').textContent = '';

    $('#give-a').hidden = false;
    $('#give-b').hidden = true;
    renderGive();
    openModal('#m-give');
  }

  function renderGive() {
    var c = S.giveCh;
    if (!c) return;

    $('#give-title').textContent = c.name;
    $('#give-sub').textContent = i18n.t('g_sub');

    $('#g-amts').innerHTML = CHARITY_PRESET_AMOUNTS.map(function (a) {
      return (
        '<button type="button" class="chip-btn" data-action="gamt" data-amt="' + a + '" aria-pressed="' + (S.giveAmt === a) + '">' +
          data.esc(data.money(a)) +
        '</button>'
      );
    }).join('');

    $('#give-steps').innerHTML = ['gs_1', 'gs_2', 'gs_3'].map(function (k) {
      return '<li>' + data.esc(i18n.t(k)) + '</li>';
    }).join('');

    $('#give-site').href = c.url;

    if (!$('#give-b').hidden) {
      $('#give-kv').innerHTML =
        kvRow(c.name, c.name) +
        kvRow(i18n.t('k_amount'), String(S.giveAmt));
    }
  }

  /* ---------------- Clipboard Copy Helper ---------------- */
  function copyTextToClipboard(text, triggerButton) {
    var onCopied = function () {
      var orig = triggerButton.textContent;
      triggerButton.textContent = i18n.t('copied');
      setTimeout(function () {
        triggerButton.textContent = orig;
      }, 1400);
    };

    var fallback = function () {
      var codeElem = triggerButton.parentNode.querySelector('code');
      if (codeElem) {
        var range = document.createRange();
        range.selectNodeContents(codeElem);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onCopied, fallback);
      } else {
        fallback();
      }
    } catch (e) {
      fallback();
    }
  }

  /* ---------------- Donor Profile Controller ---------------- */
  function openProfileModal() {
    var d = data.donorPrefs();
    $('#prof-name').value = d.name || '';
    $('#prof-gcash').value = d.gcash || '';
    $('#prof-quick').checked = d.quickPay !== false;
    $('#prof-err').textContent = '';
    openModal('#m-profile');
  }

  function updateProfileBtn() {
    var btn = $('#profile-btn');
    if (!btn) return;
    var d = data.donorPrefs();
    var hasProfile = Boolean(d.gcash && data.gcashOk(data.cleanGcash(d.gcash)));
    if (hasProfile) {
      btn.classList.add('has-profile');
      btn.title = i18n.t('profile_ready') + ' (' + d.gcash + ')';
    } else {
      btn.classList.remove('has-profile');
      btn.title = i18n.t('profile_h');
    }
  }

  /* ---------------- Event Listeners Setup ---------------- */
  function setupEventListeners() {
    // Theme button - 1-Click Instant Toggle
    var themeBtn = $('#theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', toggleTheme);
    }

    // Language buttons
    var langEn = $('#lang-en');
    var langFil = $('#lang-fil');
    if (langEn) {
      langEn.addEventListener('click', function () {
        i18n.setLang('en');
        applyLang();
      });
    }
    if (langFil) {
      langFil.addEventListener('click', function () {
        i18n.setLang('fil');
        applyLang();
      });
    }

    // Hash routing
    window.addEventListener('hashchange', route);

    // Modal dismissals (Escape key and overlay backdrop click)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModals();
    });

    $$('.modal').forEach(function (m) {
      m.addEventListener('mousedown', function (e) {
        if (e.target === m) closeModals();
      });
    });

    $$('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', closeModals);
    });

    // Delegated Global Actions
    document.addEventListener('click', function (e) {
      var actionTarget = e.target.closest('[data-action]');
      if (!actionTarget) return;

      var action = actionTarget.getAttribute('data-action');
      var id = actionTarget.getAttribute('data-id');

      if (action === 'post') {
        openPostModal();
      } else if (action === 'pay') {
        openPayModal(id);
      } else if (action === 'give') {
        openGiveModal(id);
      } else if (action === 'copy') {
        copyTextToClipboard(actionTarget.getAttribute('data-val'), actionTarget);
      } else if (action === 'ccat') {
        S.ccat = actionTarget.getAttribute('data-cat');
        renderCharities();
      } else if (action === 'gamt') {
        S.giveAmt = parseFloat(actionTarget.getAttribute('data-amt'));
        $('#g-amount').value = '';
        renderGive();
      } else if (action === 'photo') {
        var bill = getBillById(id);
        if (bill && bill.img) {
          $('#lb-img').src = data.safeImg(bill.img);
          openModal('#m-img');
        }
      } else if (action === 'view-receipt') {
        var bill = getBillById(id);
        if (bill && bill.paidReceipt) {
          $('#lb-img').src = data.safeImg(bill.paidReceipt);
          openModal('#m-img');
        }
      } else if (action === 'profile') {
        openProfileModal();
      } else if (action === 'confirm-paid') {
        var targetBill = getBillById(id);
        if (!targetBill) return;

        // Security Authorization: ONLY the requester who posted this bill can verify it!
        if (!isBillOwner(targetBill)) {
          showToast(i18n.t('e_not_owner'));
          return;
        }

        if (armedConfirmId !== id) {
          armedConfirmId = id;
          renderBills();
          setTimeout(function () {
            if (armedConfirmId === id) {
              armedConfirmId = null;
              renderBills();
            }
          }, 4500);
          return;
        }

        armedConfirmId = null;
        targetBill.status = 'paid';
        if (S.mode === 'shared') {
          S.coll.doc(id).update({ status: 'paid' }).catch(function () {
            showToast(i18n.t('e_save'));
          });
        } else {
          saveLocal();
          renderAll();
          showToast(i18n.t('proof_confirmed_msg'));
        }
      } else if (action === 'reject-proof') {
        var targetBill = getBillById(id);
        if (!targetBill) return;

        // Security Authorization: ONLY the requester who posted this bill can decline fake proof!
        if (!isBillOwner(targetBill)) {
          showToast(i18n.t('e_not_owner'));
          return;
        }

        if (armedRejectId !== id) {
          armedRejectId = id;
          renderBills();
          setTimeout(function () {
            if (armedRejectId === id) {
              armedRejectId = null;
              renderBills();
            }
          }, 4500);
          return;
        }

        armedRejectId = null;

        // 3-Strikes Anti-Fraud Penalty Execution
        var strikeRes = security ? security.recordFraudStrike(targetBill.paidSubmitterId, targetBill.paidGcash, targetBill.id) : { strikes: 1, banned: false };

        targetBill.status = 'open';
        targetBill.paidBy = '';
        targetBill.paidRef = '';
        targetBill.paidReceipt = '';
        targetBill.paidSubmitterId = '';
        targetBill.paidGcash = '';
        targetBill.paidAt = null;

        if (S.mode === 'shared') {
          S.coll.doc(id).update({
            status: 'open',
            paidBy: '',
            paidRef: '',
            paidReceipt: '',
            paidSubmitterId: '',
            paidGcash: '',
            paidAt: null
          }).catch(function () {
            showToast(i18n.t('e_save'));
          });
        } else {
          saveLocal();
          renderAll();
        }

        if (strikeRes.banned) {
          showToast(i18n.t('fake_reported_banned'));
        } else {
          showToast(i18n.t('fake_reported_strike').replace('{n}', strikeRes.strikes));
        }
      } else if (action === 'reopen') {
        var targetBill = getBillById(id);
        if (!targetBill) return;

        // Security Authorization: ONLY the requester can reopen their bill
        if (!isBillOwner(targetBill)) {
          showToast(i18n.t('e_not_owner'));
          return;
        }

        if (armedReopenId !== id) {
          armedReopenId = id;
          renderBills();
          setTimeout(function () {
            if (armedReopenId === id) {
              armedReopenId = null;
              renderBills();
            }
          }, 4500);
          return;
        }

        armedReopenId = null;
        targetBill.status = 'open';
        targetBill.paidBy = '';
        targetBill.paidRef = '';
        targetBill.paidReceipt = '';
        targetBill.paidAt = null;
        if (S.mode === 'shared') {
          S.coll.doc(id).update({ status: 'open', paidBy: '', paidRef: '', paidReceipt: '', paidAt: null }).catch(function () {
            showToast(i18n.t('e_save'));
          });
        } else {
          saveLocal();
          renderAll();
          showToast(i18n.t('reopened_toast'));
        }
      } else if (action === 'remove') {
        var targetBill = getBillById(id);
        if (!targetBill) return;

        // Security Authorization: ONLY the requester can remove their request
        if (!isBillOwner(targetBill)) {
          showToast(i18n.t('e_not_owner'));
          return;
        }

        if (armedBillId !== id) {
          armedBillId = id;
          renderBills();
          setTimeout(function () {
            if (armedBillId === id) {
              armedBillId = null;
              renderBills();
            }
          }, 4500);
          return;
        }

        armedBillId = null;
        if (S.mode === 'shared') {
          S.coll.doc(id).delete().catch(function () {
            showToast(i18n.t('e_save'));
          });
        } else {
          S.bills = S.bills.filter(function (b) { return b.id !== id; });
          saveLocal();
          renderAll();
        }
      }
    });

    // Tab click handlers for instantaneous scroll & visual response
    $$('[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        setTimeout(function () {
          route(true);
        }, 15);
      });
    });

    // Filters and inputs
    var searchInput = $('#q');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        S.q = this.value;
        renderBills();
      });
    }

    var filterType = $('#ftype');
    if (filterType) {
      filterType.addEventListener('change', function () {
        S.ftype = this.value;
        renderBills();
      });
    }

    var filterSort = $('#fsort');
    if (filterSort) {
      var onSortChange = function () {
        S.fsort = this.value;
        renderBills();
      };
      filterSort.addEventListener('change', onSortChange);
      filterSort.addEventListener('input', onSortChange);
    }

    var charitySearch = $('#cq');
    if (charitySearch) {
      charitySearch.addEventListener('input', function () {
        S.cq = this.value;
        renderCharities();
      });
    }

    // Post bill form submission
    var postForm = $('#f-post');
    if (postForm) {
      postForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = $('#p-err');
        err.textContent = '';

        // Anti-Bot Honeypot Check
        if (security && security.isBotDetected($('#hp-post'))) {
          return;
        }

        // Anti-Speed Bot Check (Minimum 1.5s to fill bill details)
        if (security && security.isTooFast(postModalOpenTime, 1500)) {
          err.textContent = i18n.t('e_too_fast');
          return;
        }

        // Rate Limiting Check (Max 4 posts per 2 minutes)
        if (security) {
          var rl = security.checkRateLimit('post_bill', 4, 120);
          if (!rl.allowed) {
            err.textContent = i18n.t('e_rate_limit');
            return;
          }
        }

        var amountVal = parseFloat($('#p-amount').value);
        var billerVal = ($('#p-biller').value || '').trim();
        var acctVal = ($('#p-account').value || '').trim();
        var dueVal = $('#p-due').value;

        if (!(amountVal >= 1 && amountVal <= 500000)) {
          err.textContent = i18n.t('e_amount');
          $('#p-amount').focus();
          return;
        }
        if (!billerVal) {
          err.textContent = i18n.t('e_biller');
          $('#p-biller').focus();
          return;
        }
        if (!acctVal) {
          err.textContent = i18n.t('e_account');
          $('#p-account').focus();
          return;
        }
        if (!dueVal) {
          err.textContent = i18n.t('e_due');
          $('#p-due').focus();
          return;
        }

        var submitBtn = $('#p-submit');
        submitBtn.disabled = true;

        var photoFile = $('#p-photo').files[0];
        (photoFile ? compressImage(photoFile) : Promise.resolve('')).then(function (imgBase64) {
          var nameVal = ($('#p-name').value || '').trim();
          var isAnon = $('#p-anon').checked || !nameVal;

          // XSS Sanitization
          var cleanBiller = security ? security.sanitize(billerVal) : billerVal;
          var cleanAcct = security ? security.sanitize(acctVal) : acctVal;
          var cleanStory = security ? security.sanitize($('#p-story').value.trim().slice(0, 300)) : $('#p-story').value.trim().slice(0, 300);
          var cleanName = security ? security.sanitize(nameVal) : nameVal;
          var myClientId = getMyClientId();

          var doc = {
            type: $('#p-type').value,
            biller: cleanBiller,
            account: cleanAcct,
            amount: Math.round(amountVal * 100) / 100,
            due: dueVal,
            story: cleanStory,
            name: isAnon ? '' : cleanName,
            anon: isAnon,
            img: imgBase64,
            status: 'open',
            createdAt: Date.now(),
            ownerId: S.myId || myClientId
          };

          if (S.mode === 'shared') {
            var docRef = S.coll.doc();
            recordMyBill(docRef.id);
            return docRef.set(doc);
          }

          doc.id = 'b_' + Date.now();
          recordMyBill(doc.id);
          S.bills.unshift(doc);
          saveLocal();
          renderAll();
        }).then(function () {
          submitBtn.disabled = false;
          closeModals();
          showToast(i18n.t('posted'));
          location.hash = '#bills';
        }).catch(function (errObj) {
          submitBtn.disabled = false;
          if (errObj && (errObj.message === 'read' || errObj.message === 'big')) {
            err.textContent = i18n.t('e_photo');
          } else if (errObj && errObj.code === 'invalid_argument') {
            err.textContent = i18n.t('e_write');
          } else {
            err.textContent = i18n.t('e_save');
          }
        });
      });
    }

    // Pay bill: step 1 (donor details)
    var payForm = $('#f-pay');
    if (payForm) {
      payForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var rawGcash = $('#d-gcash').value;
        var cleanNum = data.cleanGcash(rawGcash);

        if (!data.gcashOk(cleanNum)) {
          $('#d-err').textContent = i18n.t('e_gcash');
          return;
        }

        var nameVal = $('#d-name').value.trim();
        var isAnon = $('#d-anon').checked || !nameVal;

        if ($('#d-save-profile') && $('#d-save-profile').checked) {
          data.saveDonor(nameVal, cleanNum, true);
          updateProfileBtn();
        }

        S.payDonor = { name: isAnon ? '' : nameVal, anon: isAnon, gcash: cleanNum };

        // Auto copy account number to clipboard
        var b = S.payBill;
        if (b) {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(b.account);
              showToast(i18n.t('acct_copied'));
            }
          } catch (err) {}
        }

        $('#pay-a').hidden = true;
        $('#pay-b').hidden = false;
      });
    }

    // Pay bill: step 2 (Strict Payment Verification & Reference Check)
    var paidForm = $('#f-paid');
    if (paidForm) {
      paidForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var bill = S.payBill;
        if (!bill) return;

        var errBox = $('#paid-err');
        errBox.textContent = '';

        // Anti-Bot Honeypot Check
        if (security && security.isBotDetected($('#hp-pay'))) {
          return;
        }

        // Anti-Speed Bot Check (Minimum 2.5s)
        if (security && security.isTooFast(payModalOpenTime, 2500)) {
          errBox.textContent = i18n.t('e_too_fast');
          return;
        }

        // Rate Limiting Check (Max 5 payment submissions per minute)
        if (security) {
          var rl = security.checkRateLimit('pay_bill', 5, 60);
          if (!rl.allowed) {
            errBox.textContent = i18n.t('e_rate_limit');
            return;
          }
        }

        var rawRef = $('#d-ref').value;
        var cleanRef = data.cleanRef(rawRef);

        // Anti-Fake Gate 1: Check reference number presence
        if (!cleanRef) {
          errBox.textContent = i18n.t('e_ref_empty');
          $('#d-ref').focus();
          return;
        }

        // Anti-Fake Gate 2: Check reference number length and characters (8 to 13 digits)
        if (!data.refOk(cleanRef)) {
          errBox.textContent = i18n.t('e_ref_short');
          $('#d-ref').focus();
          return;
        }

        // Anti-Fake Gate 3: Check for duplicate reference number used across bills
        if (security && security.isDuplicateRef(cleanRef, S.bills, bill.id)) {
          errBox.textContent = i18n.t('e_duplicate_ref');
          $('#d-ref').focus();
          return;
        }

        // Anti-Fake Gate 4: Mandatory GCash Receipt Screenshot Upload
        var receiptFile = $('#d-receipt') && $('#d-receipt').files ? $('#d-receipt').files[0] : null;
        if (security) {
          var valRes = security.validateReceiptFile(receiptFile);
          if (!valRes.valid) {
            errBox.textContent = i18n.t(valRes.error || 'e_receipt_required');
            $('#d-receipt').focus();
            return;
          }
        } else if (!receiptFile) {
          errBox.textContent = i18n.t('e_receipt_required');
          $('#d-receipt').focus();
          return;
        }

        // Anti-Fake Gate 5: Mandatory certification checkbox
        var certBox = $('#d-certify');
        if (certBox && !certBox.checked) {
          errBox.textContent = i18n.t('e_certify');
          certBox.focus();
          return;
        }

        var submitBtn = $('#btn-submit-paid');
        if (submitBtn) submitBtn.disabled = true;

        var donor = S.payDonor || { name: '', anon: true };
        var cleanDonorName = security ? security.sanitize(donor.name) : donor.name;
        cleanRef = security ? security.sanitize(cleanRef) : cleanRef;

        (receiptFile ? compressImage(receiptFile) : Promise.resolve('')).then(function (receiptImg) {
          var myClientId = getMyClientId();
          var patch = {
            status: 'pending_verification',
            paidBy: cleanDonorName,
            paidAnon: donor.anon,
            paidGcash: donor.gcash || '',
            paidSubmitterId: myClientId,
            paidRef: cleanRef,
            paidReceipt: receiptImg || '',
            paidAt: Date.now()
          };

          if (S.mode === 'shared') {
            var docRef = S.coll.doc(bill.id);
            return docRef.get().then(function (docSnap) {
              var cur = docSnap.data() || {};
              if (cur.status === 'paid') {
                errBox.textContent = i18n.t('e_already');
                throw new Error('already_paid');
              }
              return docRef.update(patch);
            });
          } else {
            Object.keys(patch).forEach(function (k) {
              bill[k] = patch[k];
            });
            saveLocal();
            renderAll();
          }
        }).then(function () {
          if (submitBtn) submitBtn.disabled = false;
          closeModals();
          showToast(i18n.t('thanks'));
        }).catch(function (errObj) {
          if (submitBtn) submitBtn.disabled = false;
          if (errObj && errObj.message === 'already_paid') return;
          if (errObj && (errObj.message === 'read' || errObj.message === 'big')) {
            errBox.textContent = i18n.t('e_photo');
          } else {
            errBox.textContent = errObj && errObj.code === 'invalid_argument' ? i18n.t('e_write') : i18n.t('e_save');
          }
        });
      });
    }

    // Donor Profile Form Submission
    var profileForm = $('#f-profile');
    if (profileForm) {
      profileForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var rawGcash = $('#prof-gcash').value;
        var cleanGcashNum = data.cleanGcash(rawGcash);

        if (cleanGcashNum && !data.gcashOk(cleanGcashNum)) {
          $('#prof-err').textContent = i18n.t('e_gcash');
          $('#prof-gcash').focus();
          return;
        }

        var nameVal = $('#prof-name').value.trim();
        var quickVal = $('#prof-quick').checked;

        data.saveDonor(nameVal, cleanGcashNum, quickVal);
        updateProfileBtn();
        closeModals();
        showToast(i18n.t('profile_saved'));
      });
    }

    // Charity donation form
    var giveForm = $('#f-give');
    if (giveForm) {
      giveForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var errBox = $('#g-err');
        errBox.textContent = '';

        var customAmt = parseFloat($('#g-amount').value);
        var finalAmt = customAmt > 0 ? customAmt : S.giveAmt;

        if (!(finalAmt >= 1)) {
          errBox.textContent = i18n.t('e_gamount');
          return;
        }

        var cleanGcashNum = data.cleanGcash($('#g-gcash').value);
        if (!data.gcashOk(cleanGcashNum)) {
          errBox.textContent = i18n.t('e_gcash');
          return;
        }

        data.saveDonor($('#g-name').value.trim(), cleanGcashNum);
        S.giveAmt = finalAmt;

        $('#give-kv').innerHTML =
          kvRow(S.giveCh.name, S.giveCh.name) +
          kvRow(i18n.t('k_amount'), String(finalAmt));

        $('#give-a').hidden = true;
        $('#give-b').hidden = false;
      });
    }
  }

  /* ---------------- App Initialization ---------------- */
  setupEventListeners();
  updateProfileBtn();
  applyLang();
  route();
  boot();
})();

