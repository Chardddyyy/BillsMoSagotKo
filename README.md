# BMSK BillsMoSagotKo 💡

> **Pay it forward, one bill at a time.**
> Isang independiyenteng plataporma para sa direktang pagbabayad ng bayarin (utility bills) gamit ang GCash at tulong sa mga sertipikadong charity.

---

## 📁 Bagong Structure ng Files

Inayos at pinaghiwalay ang code upang hindi na magkakasiksikan sa iisang file:

```text
BillsMoSagotKo/
├── index.html              # Pangunahing HTML entry point
├── Sagot Ko.html           # Backwards-compatible entry point
├── package.json            # NPM scripts para sa madaling pag-run
├── css/
│   ├── variables.css       # Color tokens, Dark/Light mode theme variables
│   ├── base.css            # Base resets, safe area insets, global typography
│   ├── components.css      # Header, Navigation tabs, Hero, Perforated Bill Stubs, Cards
│   ├── modals.css          # Bottom sheet (mobile) / Dialog (desktop), Forms, Toast
│   └── responsive.css      # Adaptability para sa Mobile (<640px), Tablet, at Desktop (>=1024px)
└── js/
    ├── i18n.js             # Multi-language dictionary (English & Filipino / Tagalog)
    ├── data.js             # Charities data, sample bills, formatters, storage helpers
    ├── security.js         # Security engine: Honeypot bot traps, rate limiting, anti-fake verification
    └── app.js              # State management, routing, modal logic, event handlers
```

---

## 📱 Mobile at Desktop Adaptability

- **Mobile View (< 640px)**:
  - Header na compact at hindi nag-o-overflow.
  - Horizontal scrolling tabs na may smooth touch momentum.
  - Ticket/stub bill perforation na may dynamic amount font size.
  - Modals na nagiging **Bottom Sheet** na may safe-area bottom padding para sa modern smartphones.
  - Input fields na may `font-size: 16px` para maiwasan ang auto-zoom sa iOS Safari.
  - Touch target sizes na hindi bababa sa 44px-48px para madaling pindutin.

- **Desktop View (>= 1024px)**:
  - 3-column responsive grid para sa bills at charities.
  - Centered modals na may backdrop blur at smooth animations.
  - Hover effects (`translateY(-4px)` at elevated shadows).
  - Elegant layout container na naka-center hanggang 1200px max-width.

---

## 🚀 Paano I-run

Kasalukuyang tumatakbo ang local server sa:
👉 **`http://localhost:8088`**

Maaari mo ring i-run gamit ang terminal:
```bash
# Gamit ang Python
python3 -m http.server 8088

# O gamit ang NPM
npm start
```
Buksan lamang ang `http://localhost:8088` sa iyong browser (Safari, Chrome, o mobile browser).
