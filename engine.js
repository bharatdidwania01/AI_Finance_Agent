/* BharatWealth Nexus rule engine. Pure functions, no DOM access, so it can be unit-tested in Node. */
(function (root) {
  "use strict";

  var HIGH_EARNER_THRESHOLD = 1500000; // > 15 LPA

  // Base asset-class mix by risk profile (percent of corpus)
  var BASE = {
    Conservative: { equity: 25, gold: 10 },
    Balanced:     { equity: 50, gold: 10 },
    Aggressive:   { equity: 70, gold: 5 }
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Slab tables: [upper bound, rate]. Rates are indicative (FY 2025-26 as understood); verify before relying.
  var SLABS = {
    New: [[400000, 0], [800000, .05], [1200000, .10], [1600000, .15], [2000000, .20], [2400000, .25], [Infinity, .30]],
    Old: [[250000, 0], [500000, .05], [1000000, .20], [Infinity, .30]]
  };
  var CESS = 0.04;

  function marginalRate(income, regime) {
    var slabs = SLABS[regime] || SLABS.New;
    for (var i = 0; i < slabs.length; i++) {
      if (income <= slabs[i][0]) return slabs[i][1] * (1 + CESS);
    }
    return 0.30 * (1 + CESS);
  }

  function validate(input) {
    var errors = [];
    if (!input.name || !String(input.name).trim()) errors.push("Name is required.");
    if (!(input.age >= 18 && input.age <= 90)) errors.push("Age must be between 18 and 90.");
    if (!(input.income >= 0)) errors.push("Income must be zero or more.");
    if (!(input.corpus > 0)) errors.push("Investable corpus must be greater than zero.");
    if (!BASE[input.risk]) errors.push("Choose a valid risk profile.");
    if (input.regime !== "Old" && input.regime !== "New") errors.push("Choose a tax regime.");
    return errors;
  }

  function buildPortfolio(input) {
    var errors = validate(input);
    if (errors.length) return { errors: errors };

    var base = BASE[input.risk];
    // Glide path: ~0.3pt of equity per year away from age 40, capped at +/-10pts.
    var equity = clamp(base.equity - (input.age - 40) * 0.3, base.equity - 10, base.equity + 10);
    equity = Math.round(equity);
    var gold = base.gold;
    var fixed = 100 - equity - gold;

    var highEarner = input.income > HIGH_EARNER_THRESHOLD;
    // High earners tilt fixed income toward arbitrage funds for post-tax efficiency.
    var arbShare = highEarner ? 0.6 : 0.3;
    var arb = Math.round(fixed * arbShare);
    var debt = fixed - arb;

    var nifty50Share = input.risk === "Aggressive" ? 0.6 : 0.7;
    var n50 = Math.round(equity * nifty50Share);
    var next50 = equity - n50;

    var lines = [
      { cls: "Equity", name: "Nifty 50 Index Fund", pct: n50 },
      { cls: "Equity", name: "Nifty Next 50 Index Fund", pct: next50 },
      { cls: "Fixed Income", name: "Short-Term Debt Fund", pct: debt },
      { cls: "Fixed Income", name: "Arbitrage Fund", pct: arb },
      { cls: "Alternatives", name: "Sovereign Gold Bonds (SGB)", pct: gold }
    ].filter(function (l) { return l.pct > 0; });
    lines.forEach(function (l) { l.amount = Math.round(input.corpus * l.pct / 100); });

    var result = {
      errors: [],
      highEarner: highEarner,
      lines: lines,
      notes: [
        "Equity glide path: " + equity + "% equity for a " + input.risk + " profile at age " + input.age + ".",
        "SGB: RBI has not been issuing fresh tranches recently (unverified, please check); exposure is typically bought on the exchange secondary market, where price can differ from NAV.",
        "Debt funds bought after 1 Apr 2023 are taxed at slab rate with no indexation; their edge over FDs is liquidity and deferral, not a lower rate."
      ],
      taxInsight: null
    };

    if (highEarner) result.taxInsight = taxInsight(input);
    return result;
  }

  // Illustrative 1-year comparison of Rs 10L in FD vs arbitrage fund at same pre-tax return.
  function taxInsight(input) {
    var principal = 1000000, gross = 0.07;
    var slab = marginalRate(input.income, input.regime);
    var ltcg = 0.125 * (1 + CESS); // equity-oriented fund held > 12 months, above Rs 1.25L annual exemption
    var stcg = 0.20 * (1 + CESS);  // held <= 12 months
    var pre = principal * gross;
    var fdNet = pre * (1 - slab);
    var arbNetLong = pre * (1 - ltcg); // exemption ignored (conservative)
    var arbNetShort = pre * (1 - stcg);
    return {
      slabRate: slab, ltcgRate: ltcg, stcgRate: stcg,
      fdNet: Math.round(fdNet), arbNetLong: Math.round(arbNetLong), arbNetShort: Math.round(arbNetShort),
      annualSavingLong: Math.round(arbNetLong - fdNet),
      text:
        "Because your income is above ₹15 LPA, you are likely in a " + (slab * 100).toFixed(1) +
        "% marginal bracket (incl. 4% cess, before surcharge) under the " + input.regime + " regime. " +
        "FD interest is taxed at that slab rate every year, even if you reinvest it. " +
        "Arbitrage funds are taxed as equity-oriented funds: LTCG at 12.5% (+cess) on gains above ₹1.25 lakh a year when held beyond 12 months, " +
        "and STCG at 20% (+cess) otherwise, and tax falls due only when you redeem. " +
        "On ₹10 lakh at an assumed 7% pre-tax return, an FD nets about ₹" + fmt(fdNet) +
        " after tax, versus about ₹" + fmt(arbNetLong) + " for an arbitrage fund held over 12 months (before using the ₹1.25 lakh exemption)."
    };
  }

  function fmt(n) { return Math.round(n).toLocaleString("en-IN"); }

  // Indian-style compact currency: Rs 12.5 Cr / Rs 45.0 L
  function inr(n) {
    if (n >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
    if (n >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L";
    return "₹" + fmt(n);
  }

  var api = { buildPortfolio: buildPortfolio, marginalRate: marginalRate, inr: inr, fmt: fmt, HIGH_EARNER_THRESHOLD: HIGH_EARNER_THRESHOLD };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== "undefined" ? window : this);
