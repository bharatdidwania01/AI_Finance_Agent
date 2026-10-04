/* BharatWealth Nexus rule engine. Pure functions, no DOM access, so it can be unit-tested in Node. */
(function (root) {
  "use strict";

  // Tax tilt fires when the client's marginal slab (before cess) is at least 20%:
  // that is where arbitrage LTCG (12.5%) clearly beats FD interest taxed at slab.
  var TAX_TILT_SLAB = 0.20;
  var STANDARD_DEDUCTION = { New: 75000, Old: 50000 };

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

  // Slab rate (before cess) on the last rupee of taxable income. Only the standard deduction
  // is applied; other old-regime deductions (80C etc.) are not modelled.
  function slabRate(income, regime) {
    var slabs = SLABS[regime] || SLABS.New;
    var taxable = Math.max(0, income - (STANDARD_DEDUCTION[regime] || 0));
    for (var i = 0; i < slabs.length; i++) {
      if (taxable <= slabs[i][0]) return slabs[i][1];
    }
    return 0.30;
  }

  function marginalRate(income, regime) { return slabRate(income, regime) * (1 + CESS); }

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

    var taxTilt = slabRate(input.income, input.regime) >= TAX_TILT_SLAB;
    // Clients in the 20%+ slab tilt fixed income toward arbitrage funds for post-tax efficiency.
    var arbShare = taxTilt ? 0.6 : 0.3;
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
      taxTilt: taxTilt,
      lines: lines,
      notes: [
        "Equity glide path: " + equity + "% equity for a " + input.risk + " profile at age " + input.age + ".",
        "SGB: RBI has not been issuing fresh tranches recently (unverified, please check); exposure is typically bought on the exchange secondary market, where price can differ from NAV.",
        "Debt funds bought after 1 Apr 2023 are taxed at slab rate with no indexation; their edge over FDs is liquidity and deferral, not a lower rate."
      ],
      taxInsight: null
    };

    if (taxTilt) result.taxInsight = taxInsight(input);
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
        "Your income puts you in roughly a " + (slab * 100).toFixed(1) +
        "% marginal bracket (incl. 4% cess, before surcharge) under the " + input.regime + " regime. " +
        "FD interest is taxed at that slab rate every year, even if you reinvest it. " +
        "Arbitrage funds are taxed as equity-oriented funds: LTCG at 12.5% (+cess) on gains above ₹1.25 lakh a year when held beyond 12 months, " +
        "and STCG at 20% (+cess) otherwise, and tax falls due only when you redeem. " +
        "On ₹10 lakh at an assumed 7% pre-tax return, an FD nets about ₹" + fmt(fdNet) +
        " after tax, versus about ₹" + fmt(arbNetLong) + " for an arbitrage fund held over 12 months (before using the ₹1.25 lakh exemption)."
    };
  }

  // ---------- Personal profile analysis ----------

  // Accepts "12,50,000", "12.5 lakh", "12.5L", "1.2 cr", "50k", "₹ 4000". Returns a number, or null if blank, or NaN if unreadable.
  function parseAmount(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") return isFinite(raw) ? raw : NaN;
    var s = String(raw).toLowerCase().replace(/₹|rs\.?|inr|,|\s/g, "");
    if (!s) return null;
    var m = s.match(/^(\d+(?:\.\d+)?)(k|thousand|l|lac|lacs|lakh|lakhs|cr|crore|crores)?$/);
    if (!m) return NaN;
    var mult = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 }[m[2]] || 1;
    return Math.round(parseFloat(m[1]) * mult);
  }

  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }
  function sum(obj, keys) { return keys.reduce(function (s, k) { return s + num(obj && obj[k]); }, 0); }

  var ASSET_GROUPS = [
    { id: "bank", label: "Bank & deposits", keys: ["savings", "fd"] },
    { id: "market", label: "Mutual funds & shares", keys: ["equityMf", "debtMf", "stocks"] },
    { id: "retirement", label: "Retirement (EPF, PPF, NPS)", keys: ["epf", "ppf", "nps"] },
    { id: "gold", label: "Gold", keys: ["gold", "sgb"] },
    { id: "property", label: "Property", keys: ["home", "property"] },
    { id: "other", label: "Other", keys: ["smallSavings", "other"] }
  ];

  // Plain-language risk question -> profile. Answers: "sell" | "wait" | "buy"; horizon: "short" | "medium" | "long".
  function riskFromAnswers(risk) {
    risk = risk || {};
    var score = { sell: 0, wait: 1, buy: 2 }[risk.drop];
    if (score === undefined) return null;
    if (risk.horizon === "short") score = Math.min(score, 0);
    else if (risk.horizon === "medium") score = Math.min(score, 1);
    return ["Conservative", "Balanced", "Aggressive"][score];
  }

  var GOAL_RETURN = { Conservative: 0.07, Balanced: 0.09, Aggressive: 0.11 };
  var INFLATION = 0.06;

  // Monthly SIP that grows to `target` in `months` at annual rate r (end-of-month contributions).
  function sipFor(target, months, r) {
    if (target <= 0) return 0;
    if (months <= 0) return target;
    var i = r / 12;
    return target * i / (Math.pow(1 + i, months) - 1);
  }

  function status(value, goodIf, warnIf) { return goodIf(value) ? "good" : warnIf(value) ? "warn" : "bad"; }

  function analyzeProfile(p) {
    p = p || {};
    var about = p.about || {}, inc = p.income || {}, sp = p.spending || {}, as = p.assets || {}, ins = p.insurance || {};
    var loans = (p.loans || []).filter(function (l) { return num(l.outstanding) || num(l.emi); });
    var goals = (p.goals || []).filter(function (g) { return num(g.amount) && num(g.years); });

    var monthlyIncome = sum(inc, ["salary", "business", "rental", "pension", "interest", "other"]) + num(inc.bonus) / 12;
    var annualIncome = num(inc.annualGross) || monthlyIncome * 12;
    var annualIncomeEstimated = !num(inc.annualGross);
    var monthlySpend = sum(sp, ["household", "rent", "education", "other"]) + num(sp.premiums) / 12;
    var monthlyEmi = loans.reduce(function (s, l) { return s + num(l.emi); }, 0);
    var monthlySip = num(sp.sip);
    var surplus = monthlyIncome - monthlySpend - monthlyEmi - monthlySip;
    var savingsRate = monthlyIncome ? (monthlyIncome - monthlySpend - monthlyEmi) / monthlyIncome : null;

    var groups = ASSET_GROUPS.map(function (g) { return { id: g.id, label: g.label, value: sum(as, g.keys) }; });
    var totalAssets = groups.reduce(function (s, g) { return s + g.value; }, 0);
    var totalLoans = loans.reduce(function (s, l) { return s + num(l.outstanding); }, 0);
    var netWorth = totalAssets - totalLoans;
    var financial = totalAssets - sum(as, ["home", "property"]);
    var equity = sum(as, ["equityMf", "stocks"]);
    var equityShare = financial ? equity / financial : null;
    var liquid = sum(as, ["savings", "fd", "debtMf"]);
    var monthlyNeeds = monthlySpend + monthlyEmi;
    var emergencyMonths = monthlyNeeds ? liquid / monthlyNeeds : null;
    var emiRatio = monthlyIncome ? monthlyEmi / monthlyIncome : null;
    var dependants = num(about.children) + num(about.parents) + (about.spouseDependent === "yes" ? 1 : 0);
    var lifeCover = sum(ins, ["term", "otherLife"]);
    var healthCover = sum(ins, ["health", "employerHealth"]);
    var riskProfile = riskFromAnswers(p.risk) || "Balanced";
    var regime = about.regime === "Old" ? "Old" : "New";
    var age = num(about.age) || 40;

    var checks = [];
    var skippedIns = !!(p.skipped && p.skipped.insurance);
    if (monthlyNeeds) checks.push({
      id: "emergency", title: "Emergency fund",
      status: status(emergencyMonths, function (v) { return v >= 6; }, function (v) { return v >= 3; }),
      value: emergencyMonths.toFixed(1) + " months",
      detail: "Cash, FDs and debt funds cover " + emergencyMonths.toFixed(1) + " months of spending and EMIs. Aim for at least 6."
    });
    if (monthlyIncome && monthlyEmi) checks.push({
      id: "emi", title: "Loan EMIs vs income",
      status: status(emiRatio, function (v) { return v <= 0.35; }, function (v) { return v <= 0.5; }),
      value: Math.round(emiRatio * 100) + "% of income",
      detail: "EMIs take " + Math.round(emiRatio * 100) + "% of monthly income. Below 35% is comfortable; above 50% leaves little room."
    });
    var costly = loans.filter(function (l) { return l.type === "Credit card" || num(l.rate) >= 12; });
    if (loans.length) checks.push({
      id: "costly", title: "Expensive debt",
      status: costly.length ? "bad" : "good",
      value: costly.length ? costly.length + " loan" + (costly.length > 1 ? "s" : "") : "None",
      detail: costly.length ? "Credit card dues or loans at 12%+ interest: " + costly.map(function (l) { return l.type; }).join(", ") +
        ". Paying these off usually beats any investment return." : "No credit card dues or loans at 12% or more."
    });
    if (annualIncome && !skippedIns) {
      var mult = lifeCover / annualIncome;
      var needsCover = dependants > 0 || loans.some(function (l) { return l.type === "Home"; });
      checks.push({
        id: "life", title: "Life cover",
        status: needsCover ? status(mult, function (v) { return v >= 10; }, function (v) { return v >= 5; }) : "na",
        value: lifeCover ? mult.toFixed(1) + "x yearly income" : "None",
        detail: needsCover ? "Rule of thumb: term cover of about 10x yearly income when family or a home loan depends on you." :
          "No dependants or home loan entered, so life cover is optional for now."
      });
    }
    if (skippedIns) checks.push({ id: "health", title: "Health cover", status: "na", value: "Skipped",
      detail: "Insurance was skipped. Add your health and term cover to check them." });
    else checks.push({
      id: "health", title: "Health cover",
      status: status(healthCover, function (v) { return v >= 1000000; }, function (v) { return v >= 500000; }),
      value: healthCover ? inr(healthCover) : "None",
      detail: (num(ins.employerHealth) && !num(ins.health) ? "Only employer cover entered; it ends if you change or leave your job. " : "") +
        "Rule of thumb: at least \u20B910 lakh of family health cover."
    });
    if (monthlyIncome && monthlyNeeds) checks.push({
      id: "savings", title: "Savings rate",
      status: status(savingsRate, function (v) { return v >= 0.2; }, function (v) { return v >= 0.1; }),
      value: Math.round(savingsRate * 100) + "%",
      detail: "You keep " + Math.round(savingsRate * 100) + "% of income after spending and EMIs. 20% or more builds wealth steadily."
    });
    var targetEquity = BASE[riskProfile].equity - clamp((age - 40) * 0.3, -10, 10);
    if (financial) checks.push({
      id: "mix", title: "Equity in investments",
      status: Math.abs(equityShare * 100 - targetEquity) <= 15 ? "good" : "warn",
      value: Math.round(equityShare * 100) + "% (guide " + Math.round(targetEquity) + "%)",
      detail: "Mutual funds and shares are " + Math.round(equityShare * 100) + "% of your investments (excluding property). For a " +
        riskProfile.toLowerCase() + " investor aged " + age + ", about " + Math.round(targetEquity) + "% is a common guide."
    });

    var r = GOAL_RETURN[riskProfile];
    var goalRows = goals.map(function (g) {
      var years = num(g.years), months = years * 12;
      var rate = years <= 3 ? 0.065 : r;
      var futureCost = num(g.amount) * Math.pow(1 + INFLATION, years);
      var savedFuture = num(g.saved) * Math.pow(1 + rate, years);
      var gap = Math.max(0, futureCost - savedFuture);
      return { name: g.name || g.type, type: g.type, years: years, amount: num(g.amount), saved: num(g.saved),
        futureCost: Math.round(futureCost), monthlyNeeded: Math.round(sipFor(gap, months, rate)), rate: rate };
    });
    var goalSip = goalRows.reduce(function (s, g) { return s + g.monthlyNeeded; }, 0);
    if (goalRows.length) checks.push({
      id: "goals", title: "Goals funded",
      status: goalSip <= monthlySip + Math.max(0, surplus) ? "good" : goalSip <= monthlySip + Math.max(0, surplus) * 1.5 ? "warn" : "bad",
      value: inr(goalSip) + "/month needed",
      detail: "Your goals need about " + inr(goalSip) + " a month. You invest " + inr(monthlySip) + " and have " + inr(Math.max(0, surplus)) + " left over each month."
    });

    var investable = Math.max(0, Math.round(surplus));
    var split = buildPortfolio({ name: about.name || "You", age: clamp(age, 18, 90), income: annualIncome, corpus: investable || 100,
      risk: riskProfile, regime: regime });

    return {
      monthlyIncome: monthlyIncome, annualIncome: annualIncome, annualIncomeEstimated: annualIncomeEstimated,
      monthlySpend: monthlySpend, monthlyEmi: monthlyEmi, monthlySip: monthlySip, surplus: surplus, savingsRate: savingsRate,
      groups: groups, totalAssets: totalAssets, totalLoans: totalLoans, netWorth: netWorth, liquid: liquid,
      emergencyMonths: emergencyMonths, lifeCover: lifeCover, healthCover: healthCover, dependants: dependants,
      riskProfile: riskProfile, regime: regime, checks: checks, goals: goalRows, goalSip: goalSip,
      investable: investable, split: split, loans: loans,
      alerts: checks.filter(function (c) { return c.status === "bad"; }).length
    };
  }

  function fmt(n) { return Math.round(n).toLocaleString("en-IN"); }

  // Indian-style compact currency: Rs 12.5 Cr / Rs 45.0 L
  function inr(n) {
    if (n >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
    if (n >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L";
    return "₹" + fmt(n);
  }

  var api = { buildPortfolio: buildPortfolio, analyzeProfile: analyzeProfile, parseAmount: parseAmount, sipFor: sipFor, ASSET_GROUPS: ASSET_GROUPS, marginalRate: marginalRate, inr: inr, fmt: fmt, slabRate: slabRate, TAX_TILT_SLAB: TAX_TILT_SLAB };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== "undefined" ? window : this);
