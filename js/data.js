/**
 * BMSK BillsMoSagotKo - Data & Helper Utilities
 * Constants, sample datasets, localStorage wrappers, and data formatters
 */

window.BMSK_DATA = (function () {
  'use strict';

  var LKEY_BILLS = 'sk.bills.v1';
  var LKEY_DONOR = 'sk.donor';
  var LKEY_THEME = 'sk.theme';

  var TYPES = ['electricity', 'water', 'internet', 'tuition', 'medical', 'rent', 'other'];
  var CCATS = ['all', 'disaster', 'children', 'housing', 'community', 'environment', 'animals'];

  var CHARITIES = [
    {
      id: 'redcross',
      name: 'Philippine Red Cross',
      cat: 'disaster',
      url: 'https://redcross.org.ph/',
      en: 'Nationwide disaster response, blood services, and humanitarian emergency health care.',
      fil: 'Pagtugon sa sakuna, serbisyo sa dugo, at emergency na tulong-pangkalusugan sa buong bansa.'
    },
    {
      id: 'unicef',
      name: 'UNICEF Philippines',
      cat: 'children',
      url: 'https://www.unicef.org/philippines/',
      en: 'Child survival, nutrition, quality education, and emergency protection programs.',
      fil: 'Mga programa para sa kaligtasan, nutrisyon, de-kalidad na edukasyon, at proteksyon ng mga bata.'
    },
    {
      id: 'savechildren',
      name: 'Save the Children Philippines',
      cat: 'children',
      url: 'https://www.savethechildren.org.ph/',
      en: 'Empowering children through early childhood learning, health aid, and emergency relief.',
      fil: 'Pagpapalakas sa mga bata sa pamamagitan ng pag-aaral, tulong-medikal, at proteksyon sa sakuna.'
    },
    {
      id: 'worldvision',
      name: 'World Vision Philippines',
      cat: 'children',
      url: 'https://www.worldvision.org.ph/',
      en: 'Long-term child sponsorship, livelihood programs, and sustainable community development.',
      fil: 'Pag-sponsor sa mga bata, pangkabuhayan, at patuloy na pagpapaunlad ng mga pamayanan.'
    },
    {
      id: 'kythe',
      name: 'Kythe Foundation',
      cat: 'children',
      url: 'https://www.kythe.org/',
      en: 'Psychosocial and medical financial support for pediatric cancer patients and their families.',
      fil: 'Suportang sikolohikal at pinansyal para sa mga batang lumalaban sa kanser at kanilang pamilya.'
    },
    {
      id: 'gk',
      name: 'Gawad Kalinga',
      cat: 'housing',
      url: 'https://gk1world.com/',
      en: 'Community building, permanent social housing, and sustainable anti-poverty programs.',
      fil: 'Pagtatayo ng komunidad, disenteng pabahay, at mga programang pangkabuhayan laban sa kahirapan.'
    },
    {
      id: 'habitat',
      name: 'Habitat for Humanity Philippines',
      cat: 'housing',
      url: 'https://www.habitat.org.ph/',
      en: 'Building resilient, disaster-ready homes and community facilities for low-income families.',
      fil: 'Pagtatayo ng matitibay at ligtas na bahay para sa mga pamilyang nangangailangan.'
    },
    {
      id: 'caritas',
      name: 'Caritas Manila',
      cat: 'community',
      url: 'https://www.caritasmanila.org.ph/',
      en: 'Social services, Youth Servant Leadership scholarships, disaster recovery, and daily feeding.',
      fil: 'Serbisyong panlipunan: scholarship para sa kabataan, ayuda sa sakuna, at pagpapakain sa nagugutom.'
    },
    {
      id: 'tzuchi',
      name: 'Tzu Chi Foundation Philippines',
      cat: 'community',
      url: 'https://www.tzuchi.org.ph/',
      en: 'Compassionate medical missions, educational aid, environmental recycling, and disaster aid.',
      fil: 'Medical missions, tulong-pang-edukasyon, pangangalaga sa kalikasan, at saklolo sa kalamidad.'
    },
    {
      id: 'wwf',
      name: 'WWF-Philippines',
      cat: 'environment',
      url: 'https://wwf.org.ph/',
      en: 'Conservation of marine sanctuaries, watershed protection, renewable energy, and climate action.',
      fil: 'Pangangalaga sa karagatan, kagubatan, wildlife, at pagtataguyod ng malinis na enerhiya.'
    },
    {
      id: 'paws',
      name: 'PAWS Philippines',
      cat: 'animals',
      url: 'https://www.paws.org.ph/',
      en: 'Animal rescue, shelter rehabilitation, low-cost spay/neuter clinic, and pet adoption advocacy.',
      fil: 'Pagsagip, pagpapakapon, silungan, at paghahanap ng bagong tahanan para sa mga aso at pusa.'
    }
  ];

  /* LocalStorage Safe Wrapper */
  var LS = {
    get: function (k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set: function (k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {}
    }
  };

  /* HTML Escape */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Date Helpers */
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function addDays(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function daysUntil(iso) {
    if (!iso) return null;
    var a = new Date(iso + 'T00:00:00');
    var b = new Date(today() + 'T00:00:00');
    return Math.round((a - b) / 86400000);
  }

  /* Formatting Helpers */
  function money(n) {
    var v = Number(n) || 0;
    return '₱' + v.toLocaleString('en-PH', {
      minimumFractionDigits: v % 1 !== 0 ? 2 : 0,
      maximumFractionDigits: 2
    });
  }

  function fdate(iso, lang) {
    try {
      return new Date(iso + 'T00:00:00').toLocaleDateString(
        lang === 'fil' ? 'fil-PH' : 'en-PH',
        { month: 'short', day: 'numeric', year: 'numeric' }
      );
    } catch (e) {
      return iso;
    }
  }

  function safeImg(s) {
    return typeof s === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '';
  }

  /* Donor Preferences */
  function donorPrefs() {
    try {
      var d = JSON.parse(LS.get(LKEY_DONOR) || '{}') || {};
      if (d.quickPay === undefined) d.quickPay = true;
      return d;
    } catch (e) {
      return { quickPay: true };
    }
  }

  function saveDonor(name, gcash, quickPay) {
    var cur = donorPrefs();
    var updated = {
      name: name !== undefined ? (name || '') : (cur.name || ''),
      gcash: gcash !== undefined ? (gcash || '') : (cur.gcash || ''),
      quickPay: quickPay !== undefined ? Boolean(quickPay) : (cur.quickPay !== undefined ? cur.quickPay : true)
    };
    LS.set(LKEY_DONOR, JSON.stringify(updated));
    return updated;
  }

  function cleanGcash(v) {
    return String(v || '').replace(/[\s-]/g, '');
  }

  function gcashOk(v) {
    return !v || /^(09\d{9}|\+639\d{9})$/.test(v);
  }

  function cleanRef(v) {
    return String(v || '').replace(/[\s-]/g, '').trim();
  }

  function refOk(v) {
    var c = cleanRef(v);
    return Boolean(c && c.length >= 8 && /^[0-9A-Za-z]+$/.test(c));
  }

  /* Initial Sample Data (Empty for production) */
  function sampleBills() {
    return [];
  }

  return {
    LKEY_BILLS: LKEY_BILLS,
    LKEY_DONOR: LKEY_DONOR,
    LKEY_THEME: LKEY_THEME,
    TYPES: TYPES,
    CCATS: CCATS,
    CHARITIES: CHARITIES,
    LS: LS,
    esc: esc,
    today: today,
    addDays: addDays,
    daysUntil: daysUntil,
    money: money,
    fdate: fdate,
    safeImg: safeImg,
    donorPrefs: donorPrefs,
    saveDonor: saveDonor,
    cleanGcash: cleanGcash,
    gcashOk: gcashOk,
    cleanRef: cleanRef,
    refOk: refOk,
    sampleBills: sampleBills
  };
})();

