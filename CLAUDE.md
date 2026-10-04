# BharatWealth Nexus

Static web app (HTML/CSS/vanilla JS) simulating an India wealth-management advisor/client experience. **No Python, no build step, no server.** Open `index.html` in any browser.

## Architecture
| File | Role |
|---|---|
| `index.html` | Markup for both views (Advisor Dashboard, Client Portal) and sidebar nav |
| `styles.css` | Theming (light/dark via CSS variables), layout |
| `engine.js` | Rule engine: validation, allocation, tax-rate logic. **Pure functions, no DOM.** Exposed as `window.Engine` (and `module.exports` for Node tests) |
| `app.js` | UI layer: view switching, state, rendering. Calls `Engine`, never computes finance itself |

Scripts are classic `<script>` tags (not ES modules) so the site works from `file://`.

## State management rules
- Single source of truth: `MOCK` (constant) + `added` (user-submitted clients) in `app.js`. `clients()` derives the list; views re-render from it.
- Only `added` is persisted (`localStorage` key `bwn.clients.v1`), always inside try/catch. The app must work if storage is unavailable.
- No global mutable state in `engine.js`. Same input must give same output.
- Escape all user-supplied strings before inserting into `innerHTML` (`esc()` in `app.js`).

## Rule engine (engine.js)
- Equity: Nifty 50 + Nifty Next 50 index funds. Base equity by risk (25/50/70%), glide path of 0.3pt per year from age 40, capped at +/-10pts.
- Fixed income: Short-Term Debt + Arbitrage funds. Income > Rs 15 LPA tilts to 60% arbitrage (else 30%) and adds the explicit tax-advantage recommendation.
- Alternatives: Sovereign Gold Bonds (5-10%).
- Weights must always sum to 100; verify after any change.

## Tax assumptions (verify before each release)
Indicative FY 2025-26 rates: new/old regime slabs, 4% cess, equity-oriented fund LTCG 12.5% above Rs 1.25L (>12 months), STCG 20%; debt funds bought after 1 Apr 2023 taxed at slab. Surcharge is ignored. Known weakness: at Rs 15-16L income under the new regime the slab is only 15%, so the arbitrage edge is much smaller than the engine's headline implies.
Tax law changes (including the Income-tax Act, 2025 transition) must be re-checked; all outputs carry a "not advice" disclaimer.

## Development guidelines
- Keep dependencies at zero; no CDN scripts (must work offline).
- Mock data only. Never add real client data.
- Quick engine check: `node -e 'console.log(require("./engine.js").buildPortfolio({name:"A",age:40,income:2500000,corpus:5e6,risk:"Balanced",regime:"New"}))'`
