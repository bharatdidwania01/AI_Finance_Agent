/* Planner: decides where spare money should go, simulates what-ifs, analyses monthly spending,
   and raises advisor flags. Pure functions over a profile + Engine.analyzeProfile() result. No DOM. */
(function (root) {
  "use strict";
  var E = root.Engine || (typeof require === "function" ? require("./engine.js") : null);
  var num = E.num, inr = E.inr;

  var EXPENSIVE_RATE = 12;       // % a year: at or above this, clear the debt before investing
  var CLOSE_BAND = 2;            // percentage points: within this, prepay vs invest is a close call
  var CARD_RATE_DEFAULT = 36;    // credit card dues with no rate entered
  // Expected long-term return after tax by risk profile (pre-tax goal return minus ~1 point for tax).
  function expectedPostTax(risk) { return (E.GOAL_RETURN[risk] || 0.09) * 100 - 1; }

  function loanRate(l) { return num(l.rate) || (l.type === "Credit card" ? CARD_RATE_DEFAULT : 0); }
  function inRepayment(l) { return l.inRepayment !== "no"; }
  function isExpensive(l) { return l.type === "Credit card" || loanRate(l) >= EXPENSIVE_RATE; }

  // Effective cost after tax relief. Education-loan interest (80E) and home-loan interest (24(b), up to
  // Rs 2 lakh a year on a self-occupied home) are deductible only under the old regime.
  function effectiveRate(l, a) {
    var r = loanRate(l);
    if (a.regime !== "Old") return { rate: r, note: "" };
    var marginal = E.marginalRate(a.annualIncome, "Old");
    if (l.type === "Education") return { rate: r * (1 - marginal), note: "after the education-loan interest deduction (old regime)" };
    if (l.type === "Home") {
      var interest = num(l.outstanding) * r / 100;
      var share = interest ? Math.min(1, 200000 / interest) : 0;
      return { rate: r * (1 - marginal * share), note: "after the home-loan interest deduction (old regime, up to Rs 2 lakh a year)" };
    }
    return { rate: r, note: "" };
  }

  // Months and total interest to clear `balance` at `ratePct` paying `payment(m)` each month (m from 0).
  function payoff(balance, ratePct, payment) {
    var b = balance, i = ratePct / 1200, interest = 0, m = 0;
    var pay = typeof payment === "function" ? payment : function () { return payment; };
    while (b > 0.5 && m < 600) {
      var int = b * i; interest += int;
      var p = pay(m);
      if (p <= int) return { months: Infinity, interest: Infinity };
      b = b + int - p; m++;
    }
    return m >= 600 ? { months: Infinity, interest: Infinity } : { months: m, interest: Math.round(interest) };
  }

  function monthLabel(offset) {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }
  function futureValue(monthly, months, annualPct) {
    var i = annualPct / 1200;
    return i ? monthly * (Math.pow(1 + i, months) - 1) / i : monthly * months;
  }

  // ---------- prepay vs invest ----------
  function loanDecision(l, a) {
    var eff = effectiveRate(l, a), post = expectedPostTax(a.riskProfile), diff = eff.rate - post;
    var verdict = diff >= CLOSE_BAND ? "prepay" : diff <= -CLOSE_BAND ? "invest" : "close";
    return { loan: l, effective: Math.round(eff.rate * 10) / 10, taxNote: eff.note, expected: post, diff: Math.round(diff * 10) / 10, verdict: verdict };
  }

  // ---------- where should the money go ----------
  // mode "monthly": split the monthly surplus. mode "lump": split a one-off amount.
  // closeCall: "split" (default) | "prepay" | "invest" for loans where the numbers are within CLOSE_BAND.
  function plan(p, a, opts) {
    opts = opts || {};
    var mode = opts.mode || "monthly", closeCall = opts.closeCall || "split";
    var amount = Math.round(opts.amount !== undefined ? opts.amount : a.surplus);
    var out = { mode: mode, amount: amount, items: [], actions: [], warnings: [], closeCalls: [], left: 0 };
    var needs = a.monthlySpend + a.monthlyEmi;
    var liquid = a.liquid;
    var left = Math.max(0, amount);

    function give(item, want) {
      var amt = Math.max(0, Math.min(left, Math.round(want)));
      item.amount = amt; item.short = Math.round(want) - amt;
      if (amt > 0 || item.always) out.items.push(item);
      left -= amt; return amt;
    }

    if (amount <= 0) {
      out.warnings.push(mode === "monthly"
        ? "You are spending " + inr(-amount) + " more than you earn each month. Fix this before anything else."
        : "Enter an amount to see how to use it.");
      if (mode === "monthly") cutSuggestions(p, a).forEach(function (s) { out.actions.push(s); });
    }

    // 1. One month of expenses as a buffer.
    var bufferGap = Math.max(0, needs - liquid);
    if (bufferGap > 0) liquid += give({ id: "buffer", kind: "buffer", title: "Emergency buffer",
      reason: "You have less than one month of spending in cash. Build this first so a surprise bill doesn't go on a credit card." }, bufferGap);

    // 2. Expensive debt, highest rate first.
    a.loans.filter(isExpensive).sort(function (x, y) { return loanRate(y) - loanRate(x); }).forEach(function (l) {
      give({ id: "debt-" + (l.lid || l.type), kind: "debt", title: "Pay off " + (l.type === "Credit card" ? "credit card dues" : l.type.toLowerCase() + " loan"),
        reason: "Costs you " + loanRate(l) + "% a year. Paying it off is a guaranteed " + loanRate(l) + "% return, more than any safe investment." }, num(l.outstanding));
    });

    // 3. Emergency fund toward 6 months.
    var efGap = Math.max(0, needs * 6 - liquid);
    var efMonths = needs ? liquid / needs : 6;
    if (efGap > 0) {
      var share = mode === "lump" ? 1 : efMonths < 3 ? 0.6 : 0.4;
      liquid += give({ id: "ef", kind: "buffer", title: "Emergency fund",
        reason: "You have " + efMonths.toFixed(1) + " months of spending saved; aim for 6. Keep it in a savings account, FD or liquid fund." },
        Math.min(efGap, left * share));
    }

    // 4. Goals due within 3 years (trips, a car): safe savings, never equity.
    a.goals.filter(function (g) { return g.years <= 3; }).forEach(function (g) {
      var want = mode === "monthly" ? g.monthlyNeeded
        : Math.max(0, g.futureCost - g.saved * Math.pow(1 + g.rate, g.years)) / Math.pow(1 + g.rate, g.years);
      var got = give({ id: "goal-" + g.name, kind: "goal", title: "Save for " + g.name, always: true,
        reason: "Due in " + g.years + (g.years === 1 ? " year" : " years") + ". Keep it in an RD or liquid fund, not equity." }, want);
      if (got < Math.round(want) - 1) out.warnings.push(g.name + " gets " + inr(got) + " of the " + inr(want) + (mode === "monthly" ? " a month" : "") +
        " it needs, because the steps above come first. See the what-if tool for the trade-off.");
    });

    // 5. Education loans still in moratorium: pay the interest that is building up.
    a.loans.filter(function (l) { return !inRepayment(l) && !isExpensive(l); }).forEach(function (l) {
      var interest = num(l.outstanding) * loanRate(l) / 1200;
      give({ id: "mora-" + (l.lid || l.type), kind: "loan", title: "Pay interest on " + l.type.toLowerCase() + " loan",
        reason: "EMIs have not started, but about " + inr(interest) + " of interest is added each month. Paying it now stops the loan growing." },
        mode === "monthly" ? interest : num(l.outstanding));
    });

    // 6. Cheaper loans: prepay vs invest, highest effective rate first.
    var cheap = a.loans.filter(function (l) { return inRepayment(l) && !isExpensive(l) && num(l.outstanding) > 0; })
      .map(function (l) { return loanDecision(l, a); }).sort(function (x, y) { return y.effective - x.effective; });
    // Close calls are reported even when this month's money runs out before reaching them.
    out.closeCalls = cheap.filter(function (d) { return d.verdict === "close"; });
    for (var k = 0; k < cheap.length && left > 0; k++) {
      var d = cheap[k], l = d.loan, name = l.type.toLowerCase() + " loan";
      var why = "Costs you " + d.effective + "% a year" + (d.taxNote ? " " + d.taxNote : "") + ". Investing is expected to earn about " + d.expected +
        "% a year after tax for a " + a.riskProfile.toLowerCase() + " investor.";
      if (d.verdict === "close") {
        var frac = closeCall === "prepay" ? 1 : closeCall === "invest" ? 0 : 0.5;
        if (frac > 0) give({ id: "prepay-" + (l.lid || l.type), kind: "loan", title: "Prepay " + name + (frac < 1 ? " (half)" : ""),
          reason: why + " These are close, so " + (frac < 1 ? "half goes to the loan and half is invested." : "you chose to prepay.") }, Math.min(num(l.outstanding), left * frac));
        break; // whatever is left after a close call is invested
      }
      if (d.verdict === "prepay") give({ id: "prepay-" + (l.lid || l.type), kind: "loan", title: "Prepay " + name,
        reason: why + " The loan costs more, so paying it down wins." }, num(l.outstanding));
      else break; // investing wins for this loan and every cheaper one
    }

    // 7. Everything else: long-term investing.
    if (left > 0) {
      var split = E.buildPortfolio({ name: "x", age: Math.min(90, Math.max(18, num(p.about && p.about.age) || 40)), income: a.annualIncome,
        corpus: left, risk: a.riskProfile, regime: a.regime });
      give({ id: "invest", kind: "invest", title: mode === "lump" ? "Invest for the long term" : "Increase SIPs", split: split,
        reason: (mode === "lump" ? "Move the equity part in over about 6 months (an STP) rather than all at once. " : "") +
          "Split across index, debt, arbitrage and gold funds to suit your " + a.riskProfile.toLowerCase() + " profile." }, left);
    }

    // Non-money actions.
    if (!(p.skipped && p.skipped.insurance)) {
      var ins = p.insurance || {};
      if (!num(ins.health)) out.actions.push("Buy your own family health cover. " + (num(ins.employerHealth) ? "Employer cover ends if you change or lose your job." : "One hospital stay can wipe out years of savings."));
      if (a.dependants > 0 && a.lifeCover < a.annualIncome * 10) out.actions.push("Raise term life cover towards " + inr(a.annualIncome * 10) + " (about 10x yearly income). Term plans are the cheapest way to protect dependants.");
    }
    a.loans.filter(function (l) { return l.rateType === "Fixed" && !isExpensive(l); }).forEach(function (l) {
      out.actions.push("Your " + l.type.toLowerCase() + " loan is fixed-rate: ask the lender about prepayment charges before paying extra.");
    });
    out.left = left;
    return out;
  }

  function cutSuggestions(p, a) {
    var basis = a.spendBasis === "actual" ? avgCats(E.recentCheckins(p, 3)) : (p.spending || {});
    return E.SPEND_CATS.filter(function (c) { return c.kind === "want" && num(basis[c.key]) > 0; })
      .sort(function (x, y) { return num(basis[y.key]) - num(basis[x.key]); }).slice(0, 3)
      .map(function (c) { return "Cut back on " + c.label.toLowerCase() + " (" + inr(basis[c.key]) + " a month)."; });
  }
  function avgCats(checkins) {
    var o = {};
    E.SPEND_CATS.forEach(function (c) {
      o[c.key] = checkins.length ? checkins.reduce(function (s, x) { return s + num(x.spending && x.spending[c.key]); }, 0) / checkins.length : 0;
    });
    return o;
  }

  // ---------- what-if ----------
  // Loans the what-if can move: EMI-paying loans first (highest rate first), then loans still in moratorium.
  function simLoans(a) {
    return a.loans.filter(function (l) { return l.type !== "Credit card"; }).sort(function (x, y) {
      var px = inRepayment(x) && num(x.emi) > 0 ? 0 : 1, py = inRepayment(y) && num(y.emi) > 0 ? 0 : 1;
      return px - py || loanRate(y) - loanRate(x);
    });
  }
  // inp: { loanId, extraLoan, sipIncrease, tripCost, tripMonths }
  function simulate(p, a, inp) {
    var res = { warnings: [] };
    var free = a.surplus - num(inp.extraLoan) - num(inp.sipIncrease);
    var trip = num(inp.tripCost) && num(inp.tripMonths) ? num(inp.tripCost) / num(inp.tripMonths) : 0;
    free -= trip;
    res.free = free;
    if (free < 0) res.warnings.push("These choices need " + inr(-free) + " a month more than you have left over.");

    var loan = a.loans.find(function (l) { return (l.lid || l.type) === inp.loanId; }) || simLoans(a)[0];
    if (loan && inRepayment(loan) && num(loan.emi) > 0) {
      var r = loanRate(loan), bal = num(loan.outstanding), emi = num(loan.emi);
      var base = payoff(bal, r, emi), withX = payoff(bal, r, emi + num(inp.extraLoan));
      res.loan = { id: loan.lid || loan.type, type: loan.type, base: base, with: withX,
        baseDate: isFinite(base.months) ? monthLabel(base.months) : "never at this EMI",
        withDate: isFinite(withX.months) ? monthLabel(withX.months) : "never at this EMI",
        monthsSaved: isFinite(base.months) && isFinite(withX.months) ? base.months - withX.months : 0,
        interestSaved: isFinite(base.interest) && isFinite(withX.interest) ? base.interest - withX.interest : 0 };
      if (trip) {
        // The trade-off: the same trip money sent to the loan instead, for the saving period.
        var n = num(inp.tripMonths), extra = num(inp.extraLoan);
        var alt = payoff(bal, r, function (m) { return emi + extra + (m < n ? trip : 0); });
        res.trip = { monthly: Math.round(trip), loanMonths: isFinite(withX.months) && isFinite(alt.months) ? withX.months - alt.months : 0,
          loanInterest: isFinite(withX.interest) && isFinite(alt.interest) ? withX.interest - alt.interest : 0 };
      }
    } else if (loan && !inRepayment(loan)) res.loanNote = "Your " + loan.type.toLowerCase() + " loan is still in moratorium, so there is no payoff date to move yet.";

    if (trip && !res.trip) res.trip = { monthly: Math.round(trip), loanMonths: 0, loanInterest: 0 };
    if (res.trip) {
      var needs = a.monthlySpend + a.monthlyEmi, efMonths = needs ? a.liquid / needs : 6;
      var expensive = a.loans.filter(isExpensive);
      if (expensive.length) res.trip.flag = "You still owe " + inr(expensive.reduce(function (s, l) { return s + num(l.outstanding); }, 0)) +
        " on " + (expensive.length > 1 ? "loans" : expensive[0].type === "Credit card" ? "your credit card" : "a loan") + " at " + EXPENSIVE_RATE + "%+ interest.";
      else if (efMonths < 3) res.trip.flag = "Your emergency fund covers only " + efMonths.toFixed(1) + " months.";
      // How long the emergency fund takes to reach 6 months from what is left, with and without the trip.
      var gap = Math.max(0, needs * 6 - a.liquid);
      if (gap > 0) {
        var withTrip = Math.max(0, free), noTrip = Math.max(0, free + trip);
        res.trip.efWith = withTrip ? Math.ceil(gap / withTrip) : Infinity;
        res.trip.efWithout = noTrip ? Math.ceil(gap / noTrip) : Infinity;
      }
    }

    if (num(inp.sipIncrease)) {
      var horizon = Math.max.apply(null, [10].concat(a.goals.map(function (g) { return g.years; })));
      var rate = expectedPostTax(a.riskProfile);
      res.sip = { years: horizon, value: Math.round(futureValue(num(inp.sipIncrease), horizon * 12, rate)), invested: num(inp.sipIncrease) * horizon * 12, rate: rate };
    }
    return res;
  }

  // ---------- spending analysis from check-ins ----------
  function spendingReport(p, a) {
    var all = (p.checkins || []).slice().sort(function (x, y) { return x.month < y.month ? -1 : 1; });
    if (!all.length) return null;
    var latest = all[all.length - 1], prev = all.slice(-4, -1);
    var usual = prev.length ? avgCats(prev) : (p.spending || {});
    var rows = E.SPEND_CATS.map(function (c) {
      var now = num(latest.spending && latest.spending[c.key]), was = num(usual[c.key]);
      var change = was ? (now - was) / was : null;
      return { key: c.key, label: c.label, kind: c.kind, now: now, usual: Math.round(was), change: change,
        flag: was > 0 ? (now > was * 1.2 && now - was >= 1000) : now >= 3000 };
    }).filter(function (r) { return r.now || r.usual; });
    var needs = E.spendByKind(latest.spending, "need"), wants = E.spendByKind(latest.spending, "want");
    var emi = Object.keys(latest.loans || {}).reduce(function (s, k) { return s + num(latest.loans[k].emi) + num(latest.loans[k].extra); }, 0);
    var income = a.monthlyIncome + num(latest.extraIncome);
    var saved = Math.max(0, income - needs - wants - emi);
    return {
      month: latest.month, basis: prev.length ? "your previous " + prev.length + " month" + (prev.length > 1 ? "s" : "") : "your setup answers",
      rows: rows, flags: rows.filter(function (r) { return r.flag; }),
      total: needs + wants, needs: needs + emi, wants: wants, saved: saved, income: income,
      trend: all.slice(-6).map(function (c) { return { month: c.month, total: E.spendTotal(c.spending) }; })
    };
  }

  // Loan balance history from check-ins, per loan id.
  function loanHistory(p) {
    var h = {};
    (p.checkins || []).slice().sort(function (x, y) { return x.month < y.month ? -1 : 1; }).forEach(function (c) {
      Object.keys(c.loans || {}).forEach(function (id) {
        if (c.loans[id].balance !== undefined) (h[id] = h[id] || []).push({ month: c.month, balance: num(c.loans[id].balance) });
      });
    });
    return h;
  }

  function currentMonth() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function monthName(ym) { var x = ym.split("-"); return new Date(+x[0], +x[1] - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" }); }
  function monthsBetween(a, b) { var x = a.split("-"), y = b.split("-"); return (+y[0] - +x[0]) * 12 + (+y[1] - +x[1]); }

  // ---------- advisor flags ----------
  function advisorFlags(p, a) {
    var flags = [], pl = plan(p, a, { mode: "monthly", closeCall: (p.prefs && p.prefs.closeCall) || "split" });
    pl.closeCalls.forEach(function (d) {
      flags.push({ id: "close-" + (d.loan.lid || d.loan.type), level: "call", title: "Needs your call: prepay or invest",
        detail: d.loan.type + " loan costs " + d.effective + "% vs about " + d.expected + "% expected from investing. She has chosen " +
          ({ split: "50/50", prepay: "to prepay", invest: "to invest" })[(p.prefs && p.prefs.closeCall) || "split"] + ".", decision: d });
    });
    var cks = (p.checkins || []).map(function (c) { return c.month; }).sort();
    var now = currentMonth();
    if (!cks.length) { if (p.completedAt) flags.push({ level: "watch", title: "No monthly check-in yet", detail: "Spending and loan tracking start with the first check-in." }); }
    else if (monthsBetween(cks[cks.length - 1], now) >= 2) flags.push({ level: "watch", title: "No check-in since " + monthName(cks[cks.length - 1]), detail: "Ask her to do a quick check-in." });
    var hist = loanHistory(p);
    a.loans.filter(inRepayment).forEach(function (l) {
      var h = hist[l.lid] || [];
      if (h.length >= 2 && h[h.length - 1].balance >= h[h.length - 2].balance)
        flags.push({ level: "act", title: l.type + " loan balance is not falling", detail: "Balance went from " + inr(h[h.length - 2].balance) + " to " + inr(h[h.length - 1].balance) + ". Check EMIs are being paid." });
    });
    var sr = spendingReport(p, a);
    if (sr && sr.flags.length) flags.push({ level: "watch", title: "Spending up in " + sr.flags.length + " categor" + (sr.flags.length > 1 ? "ies" : "y"),
      detail: sr.flags.map(function (r) { return r.label + " " + inr(r.now) + (r.change !== null ? " (+" + Math.round(r.change * 100) + "%)" : ""); }).join(", ") + " in " + monthName(sr.month) + "." });
    if (a.surplus < 0) flags.push({ level: "act", title: "Spending more than income", detail: "Short by " + inr(-a.surplus) + " a month." });
    var exp = a.loans.filter(isExpensive);
    if (exp.length) flags.push({ level: "act", title: "Expensive debt", detail: exp.map(function (l) { return l.type + " " + inr(l.outstanding) + " at " + loanRate(l) + "%"; }).join(", ") + "." });
    return flags;
  }

  // Ready-to-send message with the advisor's decision on a close call.
  function decisionMessage(p, d, choice) {
    var name = ((p.about && p.about.name) || "").split(" ")[0] || "Hi";
    var l = d.loan, what = { prepay: "put your spare money into prepaying the loan", invest: "keep paying the normal EMI and invest your spare money through SIPs",
      split: "split your spare money 50/50 between prepaying the loan and SIPs" }[choice];
    return "Hi " + name + ", I looked at your " + l.type.toLowerCase() + " loan. It costs you about " + d.effective + "% a year, and investing should earn around " +
      d.expected + "% after tax. These are close, so my suggestion is to " + what + ". In BharatWealth, set \"Prepay or invest\" to " +
      ({ prepay: "Prepay", invest: "Invest", split: "Split 50/50" })[choice] + " so your plan matches.";
  }

  // Estimated balance after one month of payments, for pre-filling the check-in.
  function nextBalance(l, paid) {
    var b = num(l.outstanding), i = loanRate(l) / 1200;
    return Math.max(0, Math.round(b + b * i - num(paid)));
  }

  var api = { simLoans: simLoans, plan: plan, simulate: simulate, spendingReport: spendingReport, loanHistory: loanHistory, advisorFlags: advisorFlags,
    decisionMessage: decisionMessage, loanDecision: loanDecision, effectiveRate: effectiveRate, payoff: payoff, nextBalance: nextBalance,
    currentMonth: currentMonth, monthName: monthName, isExpensive: isExpensive, inRepayment: inRepayment, loanRate: loanRate, expectedPostTax: expectedPostTax };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Planner = api;
})(typeof window !== "undefined" ? window : this);
