# BharatWealth Nexus

Static web app (HTML/CSS/vanilla JS) simulating an India wealth-management advisor/client experience. **No Python, no build step to run it, no server.**
- Local: open `index.html` in a browser.
- Hosted: `node build.js` bundles everything into `dist/bharatwealth-nexus.html`, which is published as a claude.ai artifact.

## Product (phase 1)
- **No hash**: a family member's own profile. Consent screen ("everything you enter will be visible to Bharat"), 8-step guided setup (each step skippable, autosaved), review, then a personal dashboard with PDF/Excel export and "Send to Bharat" (profile .json file or BWN1 text code).
- **`#advisor`**: Bharat's view. Imports profiles (.json, the exported .xlsx, or pasted text), lists them, opens any as a full dashboard, deletes them. "Hide family data" hides real profiles on this device before demos. "Demo clients" holds the fictional HNWI book and a fictional sample dashboard.
- Privacy model: data never leaves a device except as a file the person chooses to send. Anyone else opening the link sees only their own (empty) data.
- **Phase 2 (not built)**: live sync without claude.ai accounts needs a backend (e.g. Supabase or Google Apps Script) and hosting outside claude.ai (claude.ai artifacts block calls to other servers, and signed-out visitors get no shared storage). Only `store.js` should change.

## Architecture
| File | Role |
|---|---|
| `index.html` | Shell + script tags. `BUILD:*` comments mark what `build.js` keeps |
| `styles.css` | Tokens on `:root` with dark overrides (`prefers-color-scheme` and `[data-theme]`); chart series `--s1..--s6` and status tokens are separate sets |
| `engine.js` | Pure finance logic: `parseAmount` (accepts "4.5 lakh", "1.2 cr", "50k"), `analyzeProfile` (net worth, cash flow, health checks, goal SIPs), `buildPortfolio` (monthly split + tax tip). No DOM; testable in Node |
| `questions.js` | The setup questions as data. Add or change questions here, not in app.js |
| `store.js` | Storage adapter (localStorage) + transfer format (`bharatwealth-nexus/profile` JSON envelope, `BWN1:` base64 code) |
| `exports.js` | PDF report (jsPDF), Excel workbook (SheetJS) with a hidden `_profile_data` sheet so the .xlsx can be re-imported, profile file, import reader |
| `app.js` | Routing, wizard, dashboards, advisor view. `ADVISOR` constant holds the advisor's name |
| `build.js` | Inlines CSS/JS into `dist/bharatwealth-nexus.html` for the claude.ai artifact |

Classic `<script>` tags (not modules) so it runs from `file://`. jsPDF 2.5.1 / SheetJS 0.18.5 from cdnjs with jsDelivr fallback, looked up at click time.

## State management rules
- Own profile: `bwn.myProfile.v1`. Imported family profiles: `bwn.family.v1` (keyed by profile `id`; an older file never overwrites a newer one). Hide switch: `bwn.hideFamily.v1`. All access via `Store`, all wrapped in try/catch.
- A profile's sections are keyed by step id (`about`, `income`, `spending`, `assets`, `loans`, `insurance`, `goals`, `risk`). `skipped[stepId]` = the person chose "Skip" (unknown), which differs from blank (= "I don't have this").
- Amounts are stored as numbers in rupees, never as text.
- Escape every user string before `innerHTML` (`esc()`).

## Downloads
`Exports.saveFile` uses the claude.ai `downloads` capability when hosted (publish with `capabilities: {downloads: true}`) and a Blob link elsewhere. PDFs print "Rs" (standard fonts lack the rupee glyph).

## Rule engine (engine.js)
- Equity: Nifty 50 + Nifty Next 50 index funds. Base equity by risk (25/50/70%), glide path of 0.3pt per year from age 40, capped at +/-10pts.
- Fixed income: Short-Term Debt + Arbitrage funds.
- **Tax tilt**: when the client's marginal slab (after standard deduction, before cess) is >= 20%, fixed income tilts to 60% arbitrage (else 30%) and the FD-vs-arbitrage recommendation is shown. New regime: taxable income above Rs 16L. Old regime: above Rs 5L.
- Alternatives: Sovereign Gold Bonds (5-10%).
- Weights must always sum to 100; verify after any change.

## Tax assumptions (verify before each release)
Indicative FY 2025-26: new/old regime slabs, standard deduction 75k/50k, 4% cess, equity-oriented fund LTCG 12.5% above Rs 1.25L (>12 months), STCG 20%; debt funds bought after 1 Apr 2023 taxed at slab. Surcharge, 87A rebate and old-regime deductions (80C etc.) are not modelled. Re-check against the Income-tax Act, 2025 transition. All outputs carry a "not advice" disclaimer.

## Development guidelines
- Never commit real family data; samples are fictional. No real bank branding.
- After any change: `node build.js`, then republish `dist/bharatwealth-nexus.html` to the same artifact.
- Quick engine check: `node -e 'console.log(require("./engine.js").buildPortfolio({name:"A",age:40,income:2500000,corpus:5e6,risk:"Balanced",regime:"New"}))'`
