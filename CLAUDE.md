# BharatWealth Nexus

Static web app (HTML/CSS/vanilla JS) simulating an India wealth-management advisor/client experience. **No Python, no build step to run it, no server.**
- Local: open `index.html` in a browser.
- Hosted: `node build.js` bundles everything into `dist/bharatwealth-nexus.html`, which is published as a claude.ai artifact.

## Architecture
| File | Role |
|---|---|
| `index.html` | Markup for both views (Advisor Dashboard, Client Portal), sidebar nav, script tags. `BUILD:*` comments mark what `build.js` keeps |
| `styles.css` | Design tokens on `:root` with dark-mode overrides (`prefers-color-scheme` and `[data-theme]`), layout |
| `engine.js` | Rule engine: validation, allocation, tax-slab logic. **Pure functions, no DOM.** `window.Engine`, or `module.exports` in Node |
| `exports.js` | PDF proposal (jsPDF) and Excel client book (SheetJS). `window.Exports` |
| `app.js` | UI layer: view switching, state, rendering. Calls `Engine`/`Exports`, never computes finance itself |
| `build.js` | Inlines CSS/JS into one artifact file and strips the html/head/body skeleton (the host adds it) |

Scripts are classic `<script>` tags (not ES modules) so the site works from `file://`. jsPDF 2.5.1 and SheetJS 0.18.5 load from cdnjs with a jsDelivr fallback; exports look the libraries up at click time and show a message if they are missing. The rest of the app works offline.

## State management rules
- Single source of truth: `MOCK` (constant) + `added` (portal submissions) in `app.js`. `clients()` derives the list; views re-render from it.
- Only `added` is persisted (`localStorage` key `bwn.clients.v1`), always inside try/catch. The app must work if storage is unavailable. Storage is per browser: nothing is shared between users.
- `lastProposal` holds the input/result behind the current PDF button.
- No mutable state in `engine.js`. Same input, same output.
- Escape all user-supplied strings before inserting into `innerHTML` (`esc()` in `app.js`).

## Downloads
`Exports.saveFile` uses the claude.ai `downloads` capability when hosted (the artifact sandbox blocks normal downloads; publish with `capabilities: {downloads: true}`) and a Blob link when opened locally. Standard PDF fonts lack the rupee glyph, so PDFs print "Rs".

## Rule engine (engine.js)
- Equity: Nifty 50 + Nifty Next 50 index funds. Base equity by risk (25/50/70%), glide path of 0.3pt per year from age 40, capped at +/-10pts.
- Fixed income: Short-Term Debt + Arbitrage funds.
- **Tax tilt**: when the client's marginal slab (after standard deduction, before cess) is >= 20%, fixed income tilts to 60% arbitrage (else 30%) and the FD-vs-arbitrage recommendation is shown. New regime: taxable income above Rs 16L. Old regime: above Rs 5L.
- Alternatives: Sovereign Gold Bonds (5-10%).
- Weights must always sum to 100; verify after any change.

## Tax assumptions (verify before each release)
Indicative FY 2025-26: new/old regime slabs, standard deduction 75k/50k, 4% cess, equity-oriented fund LTCG 12.5% above Rs 1.25L (>12 months), STCG 20%; debt funds bought after 1 Apr 2023 taxed at slab. Surcharge, 87A rebate and old-regime deductions (80C etc.) are not modelled. Re-check against the Income-tax Act, 2025 transition. All outputs carry a "not advice" disclaimer.

## Development guidelines
- No real client data; mock data only. No real bank branding.
- After any change: `node build.js`, then republish `dist/bharatwealth-nexus.html` to the same artifact.
- Quick engine check: `node -e 'console.log(require("./engine.js").buildPortfolio({name:"A",age:40,income:2500000,corpus:5e6,risk:"Balanced",regime:"New"}))'`
