/* UI layer: routing, guided setup, dashboards, advisor view. Finance logic lives in engine.js,
   questions in questions.js, persistence in store.js, files in exports.js.
   Routes: no hash = the family member's own profile; #advisor = the advisor's view. */
(function () {
  "use strict";

  var ADVISOR = "Bharat"; // shown in the consent text and the share card
  var STEPS = Questions.STEPS;
  var app = document.getElementById("app");
  var tip = document.getElementById("tip");

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function inr(n) { return Engine.inr(Math.round(n || 0)); }
  function indian(n) { return n === undefined || n === null || n === "" ? "" : Number(n).toLocaleString("en-IN"); }
  function dateIN(iso) { return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-"; }
  function firstName(p) { return ((p.about && p.about.name) || "").trim().split(/\s+/)[0] || "Your"; }
  function possessive(name) { return name === "Your" ? "Your" : name + "'s"; }
  function top() { window.scrollTo(0, 0); }

  // ---------- state ----------
  var me = null;            // this device's own profile
  var personalView = null;  // "welcome" | "wizard" | "review" | "dashboard"
  var stepIdx = 0;
  var advTab = "family";    // "family" | "demo" | "detail"
  var detail = null;        // { profile, from }

  function isAdvisor() { return location.hash.replace("#", "") === "advisor"; }
  function render() { if (isAdvisor()) renderAdvisor(); else renderPersonal(); }
  window.addEventListener("hashchange", function () { render(); top(); });

  // ---------- tooltip for chart marks ----------
  document.addEventListener("mousemove", function (e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute("data-tip"); tip.hidden = false;
    var x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px"; tip.style.top = (e.clientY + 14) + "px";
  });

  // =====================================================================
  // PERSONAL SIDE
  // =====================================================================
  function renderPersonal() {
    me = Store.loadMine();
    if (!me || !me.consentAt) personalView = "welcome";
    else if (!personalView || personalView === "welcome") {
      personalView = me.completedAt ? "dashboard" : "wizard";
      stepIdx = Math.min(me.step || 0, STEPS.length - 1);
    }
    ({ welcome: renderWelcome, wizard: renderWizard, review: renderReview, dashboard: renderOwnDashboard, checkin: renderCheckin })[personalView]();
  }

  function topbar(right) {
    return '<header class="topbar"><div class="topbar-in"><span class="brand">BharatWealth <span>Nexus</span></span>' +
      '<div class="row">' + (right || "") + "</div></div></header>";
  }

  // ---------- welcome + consent ----------
  function renderWelcome() {
    app.innerHTML = topbar() +
      '<main class="page narrow welcome"><div class="card">' +
      '<p class="eyebrow">Your personal wealth check</p>' +
      "<h1>See your whole financial picture in one place</h1>" +
      "<p>Answer simple questions about your income, savings, loans and insurance. It takes about 10 minutes. " +
      "Skip anything that does not apply and come back to it later.</p>" +
      '<ul class="checklist"><li>Your net worth and where your money sits</li><li>Health checks on emergency savings, loans and insurance</li>' +
      "<li>How much to invest each month for your goals</li><li>A PDF report and an Excel file you can download</li></ul>" +
      '<div class="consent"><input type="checkbox" id="consent"><label for="consent"><strong>Everything you enter will be visible to ' + ADVISOR +
      ".</strong> " + ADVISOR + " set up this tool to help look after your family's finances. Your answers are saved only on this device " +
      "until you send your profile to " + ADVISOR + " from your dashboard.</label></div>" +
      '<p class="err-box" id="consent-err" hidden>Tick the box above to continue.</p>' +
      '<div><button class="btn big" id="start">Start</button></div></div>' +
      '<p class="note">This tool gives general guidance from the figures you enter. It is not investment, tax or legal advice.</p></main>';
    $("start").onclick = function () {
      if (!$("consent").checked) { $("consent-err").hidden = false; return; }
      me = Store.newProfile(); me.consentAt = new Date().toISOString(); Store.saveMine(me);
      stepIdx = 0; personalView = "wizard"; render(); top();
    };
  }

  // ---------- wizard ----------
  var saveTimer = null;
  function saveSoon() {
    var el = $("saved"); if (el) el.textContent = "Saving...";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var ok = Store.saveMine(me), s = $("saved");
      if (s) s.textContent = ok ? "Saved on this device" : "Not saved: this browser blocks storage. Keep this page open.";
    }, 300);
  }

  function fieldHtml(f, value, sec, idx) {
    var id = "f-" + sec + "-" + (idx === "" ? "" : idx + "-") + f.key;
    var data = ' data-sec="' + sec + '" data-idx="' + idx + '" data-key="' + f.key + '" data-type="' + f.type + '"';
    var label = esc(f.label) + (f.per ? ' <span class="per">per ' + f.per + "</span>" : "") + (f.required ? "" : "");
    var input;
    if (f.type === "choice") {
      input = '<div class="chips" role="group" aria-label="' + esc(f.label) + '">' + f.options.map(function (o) {
        var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
        return '<button type="button" class="chip" id="' + id + "-" + esc(v).replace(/\W/g, "") + '" data-val="' + esc(v) + '"' + data +
          ' aria-pressed="' + (value === v) + '">' + esc(t) + "</button>";
      }).join("") + "</div>";
      return '<div class="field"><span class="label">' + label + "</span>" + input + (f.hint ? '<p class="hint">' + esc(f.hint) + "</p>" : "") + "</div>";
    }
    if (f.type === "amount") {
      input = '<div class="amount-wrap"><span>₹</span><input type="text" inputmode="decimal" autocomplete="off" id="' + id + '"' + data +
        ' value="' + esc(indian(value)) + '" placeholder="0"></div><p class="echo" id="' + id + '-echo">' + echo(value, f) + "</p>";
    } else if (f.type === "count") {
      input = '<input type="number" inputmode="decimal" id="' + id + '"' + data + ' value="' + esc(value === undefined ? "" : value) + '"' +
        (f.min !== undefined ? ' min="' + f.min + '"' : "") + (f.max !== undefined ? ' max="' + f.max + '"' : "") + ' step="' + (f.step || 1) + '">';
    } else {
      input = '<input type="text" id="' + id + '"' + data + ' value="' + esc(value || "") + '" placeholder="' + esc(f.placeholder || "") + '" autocomplete="off">';
    }
    return '<div class="field"><label for="' + id + '">' + label + "</label>" + input + (f.hint ? '<p class="hint">' + esc(f.hint) + "</p>" : "") + "</div>";
  }

  function echo(value, f) {
    if (value === undefined || value === null || value === "") return "";
    return "= " + inr(value) + (f.per ? " per " + f.per : "");
  }

  function stepHtml(step) {
    var sec = step.id;
    if (step.list) {
      var items = me[sec] || [];
      return items.map(function (it, i) {
        return '<div class="item"><div class="spread"><h3>' + esc(step.list.itemTitle) + " " + (i + 1) + "</h3>" +
          '<button type="button" class="btn quiet" data-remove="' + i + '">Remove</button></div>' +
          step.list.fields.map(function (f) { return fieldHtml(f, it[f.key], sec, i); }).join("") + "</div>";
      }).join("") + '<div><button type="button" class="btn ghost" id="add-item">+ ' + esc(step.list.addLabel) + "</button></div>";
    }
    var vals = me[sec] || {};
    if (step.groups) return step.groups.map(function (g) {
      return '<p class="group-title">' + esc(g.title) + "</p>" + g.fields.map(function (f) { return fieldHtml(f, vals[f.key], sec, ""); }).join("");
    }).join("");
    return step.fields.map(function (f) { return fieldHtml(f, vals[f.key], sec, ""); }).join("");
  }

  function renderWizard() {
    var step = STEPS[stepIdx], last = stepIdx === STEPS.length - 1;
    var skipLabel = step.id === "about" ? "" : step.list ? step.list.noneLabel : "Skip this step";
    app.innerHTML = topbar(me.completedAt ? '<button class="btn ghost" id="to-dash">Back to dashboard</button>' : "") +
      '<main class="page narrow"><div class="progress"><div class="spread"><span class="eyebrow">Step ' + (stepIdx + 1) + " of " + STEPS.length +
      '</span><span class="saved" id="saved">Saved on this device</span></div>' +
      '<div class="progress-bar"><div style="width:' + Math.round((stepIdx + 1) / STEPS.length * 100) + '%"></div></div></div>' +
      '<form class="card" id="wiz" novalidate><h1>' + esc(step.title) + '</h1><p class="mute">' + esc(step.intro) + "</p>" +
      '<div class="fields" id="fields">' + stepHtml(step) + "</div>" +
      '<p class="err-box" id="wiz-err" hidden></p>' +
      '<div class="wiz-nav"><button type="button" class="btn quiet" id="back"' + (stepIdx === 0 ? " hidden" : "") + ">Back</button>" +
      '<div class="row">' + (skipLabel ? '<button type="button" class="btn ghost" id="skip">' + esc(skipLabel) + "</button>" : "") +
      '<button type="submit" class="btn" id="next">' + (last ? "Review my answers" : "Save and continue") + "</button></div></div></form></main>";

    var fields = $("fields");
    fields.addEventListener("input", onFieldInput);
    fields.addEventListener("focusout", function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.type === "amount") { var n = Engine.parseAmount(t.value); if (n !== null && !isNaN(n)) t.value = indian(n); }
    });
    fields.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (chip) {
        var on = chip.getAttribute("aria-pressed") !== "true";
        chip.parentNode.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
        chip.setAttribute("aria-pressed", String(on));
        setVal(chip.dataset.sec, chip.dataset.idx, chip.dataset.key, on ? chip.dataset.val : null);
        return;
      }
      var rm = e.target.closest("[data-remove]");
      if (rm) { me[step.id].splice(Number(rm.dataset.remove), 1); saveSoon(); rerenderFields(step); return; }
      if (e.target.id === "add-item") {
        me[step.id] = me[step.id] || []; me[step.id].push(step.id === "loans" ? { lid: Store.loanId(), rateType: "Floating", inRepayment: "yes" } : {}); delete me.skipped[step.id]; saveSoon(); rerenderFields(step);
        var items = fields.querySelectorAll(".item"); if (items.length) items[items.length - 1].scrollIntoView({ block: "nearest" });
      }
    });
    if ($("to-dash")) $("to-dash").onclick = function () { personalView = "dashboard"; render(); top(); };
    $("back").onclick = function () { stepIdx--; me.step = stepIdx; saveSoon(); renderWizard(); top(); };
    if ($("skip")) $("skip").onclick = function () {
      if (step.id === "loans") { me.loans = []; delete me.skipped.loans; } else me.skipped[step.id] = true;
      advance();
    };
    $("wiz").onsubmit = function (e) {
      e.preventDefault();
      var err = validateStep(step);
      if (err) { $("wiz-err").textContent = err; $("wiz-err").hidden = false; return; }
      delete me.skipped[step.id];
      advance();
    };
  }

  function rerenderFields(step) { $("fields").innerHTML = stepHtml(step); }

  function onFieldInput(e) {
    var t = e.target, d = t.dataset;
    if (!d || !d.key) return;
    $("wiz-err").hidden = true;
    var val;
    if (d.type === "amount") {
      var n = Engine.parseAmount(t.value), out = $(t.id + "-echo");
      var f = fieldDef(d.sec, d.key);
      if (n === null) { val = null; out.textContent = ""; out.className = "echo"; }
      else if (isNaN(n)) { val = undefined; out.textContent = "Could not read this. Try 45000, 4.5 lakh or 1.2 crore."; out.className = "echo err"; }
      else { val = n; out.textContent = echo(n, f); out.className = "echo"; }
      if (val === undefined) return; // keep the last good value until the entry is readable
    } else if (d.type === "count") val = t.value === "" ? null : Number(t.value);
    else val = t.value;
    setVal(d.sec, d.idx, d.key, val);
  }

  function fieldDef(sec, key) {
    var step = STEPS.find(function (s) { return s.id === sec; });
    var list = step.list ? step.list.fields : Questions.fieldsOf(step);
    return list.find(function (f) { return f.key === key; }) || {};
  }

  function setVal(sec, idx, key, val) {
    var target;
    if (idx === "" || idx === undefined) target = me[sec] = me[sec] || {};
    else target = me[sec][Number(idx)];
    if (val === null || val === "" || val === undefined) delete target[key]; else target[key] = val;
    delete me.skipped[sec];
    saveSoon();
  }

  function validateStep(step) {
    if (document.querySelector("#fields .echo.err")) return "Fix the amounts marked in red, or clear them.";
    var problems = [];
    function check(f, v, where) {
      if (f.required && (v === undefined || v === "" || v === null)) problems.push(f.label + " is needed" + where + ".");
      if (f.type === "count" && v !== undefined && v !== null && v !== "" &&
        (isNaN(v) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)))
        problems.push(f.label + where + " should be between " + f.min + " and " + f.max + ".");
    }
    if (step.list) (me[step.id] || []).forEach(function (it, i) {
      step.list.fields.forEach(function (f) { check(f, it[f.key], " (" + step.list.itemTitle.toLowerCase() + " " + (i + 1) + ")"); });
    });
    else Questions.fieldsOf(step).forEach(function (f) { check(f, (me[step.id] || {})[f.key], ""); });
    return problems.join(" ");
  }

  function advance() {
    clearTimeout(saveTimer);
    if (stepIdx < STEPS.length - 1) { stepIdx++; me.step = stepIdx; Store.saveMine(me); renderWizard(); }
    else { me.step = STEPS.length - 1; Store.saveMine(me); personalView = "review"; renderReview(); }
    top();
  }

  // ---------- review ----------
  function stepSummary(step) {
    if (me.skipped && me.skipped[step.id]) return { text: "Skipped", done: false };
    if (step.list) {
      var n = (me[step.id] || []).length;
      return { text: n ? n + " " + step.list.itemTitle.toLowerCase() + (n > 1 ? "s" : "") : "None", done: true };
    }
    var fs = Questions.fieldsOf(step), vals = me[step.id] || {};
    var answered = fs.filter(function (f) { return vals[f.key] !== undefined && vals[f.key] !== ""; }).length;
    return { text: answered + " of " + fs.length + " answered", done: answered > 0 };
  }

  function renderReview() {
    app.innerHTML = topbar(me.completedAt ? '<button class="btn ghost" id="to-dash">Back to dashboard</button>' : "") +
      '<main class="page narrow"><div class="card"><p class="eyebrow">Almost done</p><h1>Check your answers</h1>' +
      '<p class="mute">Blank answers count as "I don\'t have this". Edit anything, then ' + (me.completedAt ? "update" : "create") + " your dashboard.</p>" +
      '<div class="review-list">' + STEPS.map(function (s, i) {
        var sum = stepSummary(s);
        return '<div class="review-row"><div><strong>' + esc(s.title) + '</strong><br><span class="pill' + (sum.done ? " done" : "") + '">' +
          esc(sum.text) + '</span></div><button class="btn ghost" data-edit="' + i + '">Edit</button></div>';
      }).join("") + "</div>" +
      '<div><button class="btn big" id="create">' + (me.completedAt ? "Update my dashboard" : "Create my dashboard") + "</button></div></div></main>";
    app.querySelectorAll("[data-edit]").forEach(function (b) {
      b.onclick = function () { stepIdx = Number(b.dataset.edit); personalView = "wizard"; renderWizard(); top(); };
    });
    if ($("to-dash")) $("to-dash").onclick = function () { personalView = "dashboard"; render(); top(); };
    $("create").onclick = function () {
      me.completedAt = me.completedAt || new Date().toISOString();
      Store.saveMine(me); personalView = "dashboard"; render(); top();
    };
  }

  // ---------- own dashboard ----------
  function renderOwnDashboard() {
    var a = Engine.analyzeProfile(me);
    app.innerHTML = topbar('<button class="btn ghost" id="edit">Edit my answers</button>') +
      '<main class="page">' + dashboardHtml(me, a, { own: true }) + "</main>";
    bindDashboard(me, a);
    $("edit").onclick = function () { personalView = "review"; renderReview(); top(); };
    $("send-file").onclick = function () {
      var btn = this, f = Exports.profileFile(me);
      btn.disabled = true;
      Exports.saveFile(f.filename, f.blob).then(function (r) {
        $("send-status").textContent = r.ok ? r.msg + " Send this file to " + ADVISOR + " on WhatsApp or email." : r.msg;
        if (r.unavailable) showCode();
      }).finally(function () { btn.disabled = false; });
    };
    $("send-code").onclick = function () {
      var code = Store.toCode(me);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () {
          $("send-status").textContent = "Copied. Paste it into a WhatsApp message or email to " + ADVISOR + ".";
        }, showCode);
      } else showCode();
    };
    function showCode() {
      var box = $("code-box"); box.value = Store.toCode(me); box.hidden = false; box.focus(); box.select();
      $("send-status").textContent = "Copy all of the text below and send it to " + ADVISOR + ".";
    }
  }

  // =====================================================================
  // DASHBOARD (shared by the family member and the advisor)
  // =====================================================================
  var SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];
  var STATUS = { good: ["✓", "Good"], warn: ["!", "Needs attention"], bad: ["✕", "Act now"], na: ["–", "Not applicable"] };
  function statusChip(s) { return '<span class="status ' + s + '"><span aria-hidden="true">' + STATUS[s][0] + "</span>" + STATUS[s][1] + "</span>"; }

  function dashboardHtml(p, a, opts) {
    var name = firstName(p);
    var surplusBad = a.surplus < 0;
    var h = '<div class="dash-head"><div><p class="eyebrow">' + (opts.own ? "Your dashboard" : esc(opts.label || "Family profile")) + "</p>" +
      "<h1>" + esc(possessive(name)) + " wealth</h1>" +
      '<p class="mute small">Last updated ' + dateIN(p.updatedAt) + " · " + esc(a.riskProfile) + " investor · " + esc(a.regime) + " tax regime" +
      (p.about && p.about.city ? " · " + esc(p.about.city) : "") + "</p></div>" +
      '<div class="row"><button class="btn ghost" id="dl-xlsx">Download Excel</button><button class="btn" id="dl-pdf">Download PDF report</button></div></div>' +
      '<p class="status-line" id="dl-status"></p>';

    h += '<div class="kpis">' +
      kpi("Net worth", inr(a.netWorth), "Assets " + inr(a.totalAssets) + " minus loans " + inr(a.totalLoans), "lead") +
      kpi(surplusBad ? "Monthly shortfall" : "Left over each month", inr(Math.abs(a.surplus)),
        surplusBad ? "Spending, EMIs and SIPs exceed income" : "After spending, EMIs and SIPs") +
      kpi("Loans outstanding", inr(a.totalLoans), a.monthlyEmi ? inr(a.monthlyEmi) + " in EMIs each month" : "No EMIs") +
      kpi("Emergency fund", a.emergencyMonths === null ? "-" : a.emergencyMonths.toFixed(1) + " months",
        "Cash, FDs and debt funds vs monthly needs") + "</div>";

    var pl = Planner.plan(p, a, { closeCall: (p.prefs && p.prefs.closeCall) || "split" });
    h += planHtml(p, a, pl, opts);
    if (opts.own) h += checkinCta(p);

    var acts = a.checks.filter(function (c) { return c.status === "bad"; }).length;
    var warns = a.checks.filter(function (c) { return c.status === "warn"; }).length;
    h += '<section class="card"><div class="spread"><h2>Health check</h2><span class="mute small">' +
      (acts ? acts + " to act on" : "Nothing urgent") + (warns ? ", " + warns + " to watch" : "") + "</span></div>" +
      '<div class="checks">' + a.checks.map(function (c) {
        return '<div class="check"><div class="top"><h3>' + esc(c.title) + "</h3>" + statusChip(c.status) + "</div>" +
          '<div class="val">' + esc(c.value) + '</div><p class="small mute">' + esc(c.detail) + "</p></div>";
      }).join("") + '</div><p class="note">Thresholds are common rules of thumb used by planners, not regulations.</p></section>';

    h += spendingHtml(p, a);

    // Wealth composition + cash flow
    var groups = a.groups.filter(function (g) { return g.value > 0; });
    var colorOf = {}; a.groups.forEach(function (g, i) { colorOf[g.id] = "var(" + SERIES[i] + ")"; }); // colour follows the category
    var wealth = a.totalAssets ? '<div class="stack" role="img" aria-label="Assets by category">' + groups.map(function (g) {
      var pct = g.value / a.totalAssets * 100;
      return '<div style="width:' + pct + "%;background:" + colorOf[g.id] + '" data-tip="' + esc(g.label + ": " + inr(g.value) + " (" + Math.round(pct) + "%)") + '"></div>';
    }).join("") + "</div>" +
      '<div class="table-wrap"><table><thead><tr><th>Category</th><th class="r">Value</th><th class="r">Share</th></tr></thead><tbody>' +
      groups.map(function (g) {
        return '<tr><td><span class="sw" style="background:' + colorOf[g.id] + '"></span>' + esc(g.label) + '</td><td class="r">' + inr(g.value) +
          '</td><td class="r">' + Math.round(g.value / a.totalAssets * 100) + "%</td></tr>";
      }).join("") + '</tbody><tfoot><tr><td>Total</td><td class="r">' + inr(a.totalAssets) + '</td><td class="r">100%</td></tr></tfoot></table></div>'
      : '<p class="mute">No assets entered yet.</p>';

    var flowMax = Math.max(a.monthlyIncome, a.monthlySpend + a.monthlyEmi + a.monthlySip, 1);
    function bar(label, v, cls) {
      return '<div class="bar-row ' + (cls || "") + '"><span>' + label + '</span><div class="bar-track"><div style="width:' +
        Math.max(0, v) / flowMax * 100 + '%" data-tip="' + esc(label + ": " + inr(v)) + '"></div></div><span class="num">' + inr(v) + "</span></div>";
    }
    var flow = a.monthlyIncome || a.monthlySpend ? '<div class="bars">' + bar("Income", a.monthlyIncome) + bar("Spending", a.monthlySpend, "out") +
      bar("Loan EMIs", a.monthlyEmi, "out") + bar("SIPs and RDs", a.monthlySip, "out") +
      bar(a.surplus < 0 ? "Shortfall" : "Left over", Math.abs(a.surplus), "total") + "</div>" +
      (a.annualIncomeEstimated && a.monthlyIncome ? '<p class="note">Tax bracket estimated from monthly income. Add yearly income before tax for a better estimate.</p>' : "")
      : '<p class="mute">No income or spending entered yet.</p>';

    h += '<div class="grid2"><section class="card"><h2>Where your wealth sits</h2>' + wealth + "</section>" +
      '<section class="card"><h2>Monthly cash flow</h2>' + flow + "</section></div>";

    h += loansHtml(p, a);

    if (a.goals.length) {
      var have = a.monthlySip + Math.max(0, a.surplus);
      h += '<section class="card"><div class="spread"><h2>Goals</h2><span class="mute small">Need ' + inr(a.goalSip) + "/month · you can put aside " + inr(have) + "</span></div>" +
        '<div class="table-wrap"><table><thead><tr><th>Goal</th><th class="r">In</th><th class="r">Cost today</th><th class="r">Cost then</th>' +
        '<th class="r">Already saved</th><th class="r">Invest per month</th></tr></thead><tbody>' + a.goals.map(function (g) {
          return "<tr><td>" + esc(g.name) + '</td><td class="r">' + g.years + ' yrs</td><td class="r">' + inr(g.amount) + '</td><td class="r">' + inr(g.futureCost) +
            '</td><td class="r">' + inr(g.saved) + '</td><td class="r">' + inr(g.monthlyNeeded) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<p class="note">Costs rise 6% a year for inflation. Assumed returns: 6.5% for goals within 3 years, ' +
        Math.round(({ Conservative: 7, Balanced: 9, Aggressive: 11 })[a.riskProfile]) + "% for longer goals.</p></section>";
    }

    h += toolsHtml(p, a);

    var split = a.split;
    var sipAmt = (pl.items.find(function (x) { return x.id === "invest"; }) || {}).amount || 0;
    a = Object.assign({}, a, { investable: sipAmt });
    h += '<section class="card"><h2>' + (sipAmt ? "How to split your extra " + inr(sipAmt) + " of SIPs" : "How to split future SIPs") + "</h2>" +
      (sipAmt ? "" : '<p class="mute small">Your plan sends this month\'s money to steps that come first. Use this split once SIPs are next.</p>') +
      '<div class="stack" role="img" aria-label="Suggested split">' + split.lines.map(function (l, i) {
        return '<div style="width:' + l.pct + "%;background:var(" + SERIES[i] + ')" data-tip="' + esc(l.name + ": " + l.pct + "%") + '"></div>';
      }).join("") + "</div>" +
      '<div class="table-wrap"><table><thead><tr><th>Fund type</th><th>Asset class</th><th class="r">Share</th><th class="r">Per month</th></tr></thead><tbody>' +
      split.lines.map(function (l, i) {
        return '<tr><td><span class="sw" style="background:var(' + SERIES[i] + ')"></span>' + esc(l.name) + "</td><td>" + esc(l.cls) + '</td><td class="r">' +
          l.pct + '%</td><td class="r">' + (a.investable ? inr(a.investable * l.pct / 100) : "-") + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      (split.taxInsight ? '<div class="card callout"><h3>Tax tip: arbitrage funds vs FDs</h3><p class="small">' + esc(split.taxInsight.text) + "</p></div>" : "") +
      '<p class="note">Based on a ' + esc(a.riskProfile.toLowerCase()) + " risk profile and age " + esc((p.about && p.about.age) || "40") +
      ". Clear high-interest debt and build the emergency fund before investing for growth.</p></section>";

    if (opts.own) h += '<section class="card share"><h2>Send your profile to ' + ADVISOR + "</h2>" +
      "<p>" + ADVISOR + " can see everything in this file. Send it again whenever you update your answers.</p>" +
      '<div class="row"><button class="btn" id="send-file">Download profile file</button><button class="btn ghost" id="send-code">Copy as text</button></div>' +
      '<p class="status-line" id="send-status"></p><textarea class="code" id="code-box" readonly hidden></textarea>' +
      '<p class="note">The Excel download also works: it carries the same profile.</p></section>';

    h += '<p class="note">General guidance from the figures entered, using simple rules of thumb. Not investment, tax or legal advice. ' +
      "Tax rates are indicative for FY 2025-26. Mutual fund investments are subject to market risks.</p>";
    return h;
  }

  function kpi(k, v, s, cls) {
    return '<div class="kpi ' + (cls || "") + '"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span><span class="s">' + esc(s) + "</span></div>";
  }

  function bindDashboard(p, a) {
    function run(btn, build) {
      btn.disabled = true; $("dl-status").textContent = "Preparing file...";
      Promise.resolve().then(function () { var f = build(); return Exports.saveFile(f.filename, f.blob); })
        .then(function (r) { $("dl-status").textContent = r.msg; }, function (e) { $("dl-status").textContent = e.message || "Export failed."; })
        .finally(function () { btn.disabled = false; });
    }
    $("dl-pdf").onclick = function () { run(this, function () { return Exports.reportPdf(p, a); }); };
    bindTools(p, a);
    $("dl-xlsx").onclick = function () { run(this, function () { return Exports.reportXlsx(p, a); }); };
  }

  // ---------- plan: where this month's money should go ----------
  var CC_LABEL = { split: "Split 50/50", prepay: "Prepay", invest: "Invest" };
  function planHtml(p, a, pl, opts) {
    var basis = a.spendBasis === "actual" ? "based on your last " + a.spendMonths + " check-in" + (a.spendMonths > 1 ? "s" : "") : "based on your setup answers";
    var h = '<section class="card plan"><div class="spread"><h2>' + (opts.own ? "Your plan for this month" : "Plan for this month") + "</h2>" +
      '<span class="mute small">' + (a.surplus > 0 ? inr(a.surplus) + " left over each month, " + basis : basis) + "</span></div>";
    if (pl.warnings.length) h += '<div class="warn-box">' + pl.warnings.map(function (w) { return "<p>" + esc(w) + "</p>"; }).join("") + "</div>";
    if (pl.items.length) h += '<ol class="plan-list">' + pl.items.map(function (it) {
      return '<li><span class="plan-amt num">' + inr(it.amount) + '</span><div><strong>' + esc(it.title) + "</strong>" +
        (it.short > 1 ? ' <span class="status warn">' + inr(it.short) + " short</span>" : "") + '<p class="small mute">' + esc(it.reason) + "</p></div></li>";
    }).join("") + "</ol>";
    pl.closeCalls.forEach(function (d) {
      var choice = (p.prefs && p.prefs.closeCall) || "split";
      h += '<div class="closecall"><h3>Prepay your ' + esc(d.loan.type.toLowerCase()) + " loan or invest?</h3>" +
        '<p class="small">The loan costs <strong>' + d.effective + "%</strong> a year" + (d.taxNote ? " " + esc(d.taxNote) : "") +
        ". Investing is expected to earn about <strong>" + d.expected + "%</strong> a year after tax. That is too close to call on numbers alone.</p>" +
        (opts.own
          ? '<div class="seg" role="group" aria-label="Prepay or invest">' + ["split", "prepay", "invest"].map(function (c) {
              return '<button type="button" class="chip" data-cc="' + c + '" aria-pressed="' + (choice === c) + '">' + CC_LABEL[c] + "</button>"; }).join("") + "</div>" +
            '<p class="note">' + ADVISOR + " gets an alert about this when you send your profile, and will tell you which way to go.</p>"
          : '<p class="small">Her choice: <strong>' + CC_LABEL[choice] + "</strong></p>") + "</div>";
    });
    if (pl.actions.length) h += '<div><h3>Also do</h3><ul class="small">' + pl.actions.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    h += '<p class="note">Order used: one-month buffer, expensive debt, emergency fund, goals within 3 years, loans vs investing, then SIPs. ' +
      "Expected returns are assumptions, not promises.</p></section>";
    return h;
  }

  function checkinCta(p) {
    var cur = Planner.currentMonth(), months = (p.checkins || []).map(function (c) { return c.month; }).sort();
    var last = months[months.length - 1], done = last === cur;
    return '<section class="card soft"><div class="spread"><div><h2>Monthly check-in</h2><p class="small">' +
      (done ? "Done for " + Planner.monthName(cur) + ". You can still change it." :
        last ? "Last check-in: " + Planner.monthName(last) + ". Takes about 3 minutes." :
        "Record this month's spending and loan payments to start tracking. Takes about 3 minutes.") +
      '</p></div><button class="btn" id="checkin">' + (done ? "Edit this month" : "Check in for " + Planner.monthName(cur)) + "</button></div></section>";
  }

  // ---------- spending analysis ----------
  function spendingHtml(p, a) {
    var sr = Planner.spendingReport(p, a);
    if (!sr) return "";
    var h = '<section class="card"><div class="spread"><h2>Spending in ' + esc(Planner.monthName(sr.month)) + "</h2>" +
      '<span class="mute small">Compared with ' + esc(sr.basis) + "</span></div>";
    if (sr.flags.length) h += '<div class="warn-box">' + sr.flags.map(function (r) {
      return "<p><strong>" + esc(r.label) + "</strong>: " + inr(r.now) + (r.usual ? ", up " + Math.round(r.change * 100) + "% on your usual " + inr(r.usual) : "") + ".</p>";
    }).join("") + "</div>";
    var inc = sr.income || 1;
    function guide(label, v, target, tipText) {
      var pct = Math.round(v / inc * 100);
      return '<div class="bar-row guide"><span>' + label + '</span><div class="bar-track"><div style="width:' + Math.min(100, pct) + '%" data-tip="' +
        esc(tipText + ": " + inr(v) + " (" + pct + "% of income)") + '"></div><i style="left:' + target + '%" title="Guide ' + target + '%"></i></div>' +
        '<span class="num">' + pct + "% <span class=\"mute\">/ " + target + "%</span></span></div>";
    }
    h += '<div class="bars">' + guide("Needs + EMIs", sr.needs, 50, "Needs and EMIs") + guide("Wants", sr.wants, 30, "Wants") +
      guide("Saved", sr.saved, 20, "Left to save") + '</div><p class="note">The 50/30/20 guide: about half of income on needs, 30% on wants, 20% saved. The tick marks the guide.</p>';
    h += '<div class="table-wrap"><table><thead><tr><th>Category</th><th>Type</th><th class="r">This month</th><th class="r">Usual</th><th class="r">Change</th></tr></thead><tbody>' +
      sr.rows.map(function (r) {
        var ch = r.change === null ? "new" : (r.change > 0 ? "+" : "") + Math.round(r.change * 100) + "%";
        return "<tr" + (r.flag ? ' class="flagged"' : "") + "><td>" + esc(r.label) + '</td><td class="mute">' + (r.kind === "need" ? "Need" : "Want") +
          '</td><td class="r">' + inr(r.now) + '</td><td class="r">' + inr(r.usual) + '</td><td class="r">' + (r.flag ? '<span class="status warn">' + ch + "</span>" : ch) + "</td></tr>";
      }).join("") + '</tbody><tfoot><tr><td>Total</td><td></td><td class="r">' + inr(sr.total) + "</td><td></td><td></td></tr></tfoot></table></div>";
    if (sr.trend.length > 1) {
      var max = Math.max.apply(null, sr.trend.map(function (t) { return t.total; })) || 1;
      h += '<div><h3>Total spending by month</h3><div class="cols">' + sr.trend.map(function (t) {
        return '<div class="col"><span class="num tiny">' + inr(t.total) + '</span><div class="col-bar" style="height:' + Math.round(t.total / max * 100) +
          '%" data-tip="' + esc(Planner.monthName(t.month) + ": " + inr(t.total)) + '"></div><span class="tiny mute">' + esc(Planner.monthName(t.month)) + "</span></div>";
      }).join("") + "</div></div>";
    }
    return h + "</section>";
  }

  // ---------- loans with payoff dates and tracked balances ----------
  function loansHtml(p, a) {
    if (!a.loans.length) return "";
    var hist = Planner.loanHistory(p);
    return '<section class="card"><h2>What you owe</h2><div class="table-wrap"><table><thead><tr><th>Loan</th><th class="r">Outstanding</th>' +
      '<th class="r">EMI</th><th class="r">Rate</th><th>Debt-free by</th><th>Progress</th></tr></thead><tbody>' + a.loans.map(function (l) {
        var when;
        if (!Planner.inRepayment(l)) when = "EMIs not started";
        else if (!Engine.num(l.emi)) when = l.type === "Credit card" ? "Pay in full" : "-";
        else { var po = Planner.payoff(Engine.num(l.outstanding), Planner.loanRate(l), Engine.num(l.emi));
          when = isFinite(po.months) ? new Date(new Date().setMonth(new Date().getMonth() + po.months)).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "EMI too low"; }
        var h = hist[l.lid] || [], prog = "-";
        if (h.length >= 2) {
          var diff = h[0].balance - h[h.length - 1].balance;
          prog = diff > 0 ? "Down " + inr(diff) + " since " + Planner.monthName(h[0].month) : '<span class="status bad">Up ' + inr(-diff) + "</span>";
        }
        return "<tr><td>" + esc(l.type || "Loan") + (l.rateType === "Fixed" ? ' <span class="mute tiny">fixed</span>' : "") + '</td><td class="r">' + inr(l.outstanding) +
          '</td><td class="r">' + inr(l.emi) + '</td><td class="r">' + (Planner.loanRate(l) ? esc(Planner.loanRate(l)) + "%" : "-") + "</td><td>" + when + "</td><td>" + prog + "</td></tr>";
      }).join("") + '</tbody><tfoot><tr><td>Total</td><td class="r">' + inr(a.totalLoans) + '</td><td class="r">' + inr(a.monthlyEmi) +
      "</td><td></td><td></td><td></td></tr></tfoot></table></div></section>";
  }

  // ---------- what-if and lump-sum tools ----------
  function toolsHtml(p, a) {
    var loans = Planner.simLoans(a);
    var cap = Math.max(10000, Math.ceil(Math.max(0, a.surplus) / 1000) * 1000);
    var step = cap > 50000 ? 1000 : 500;
    return '<section class="card" id="whatif"><h2>Try it out</h2><p class="mute small">Move the sliders to see what changes. ' +
      (a.surplus > 0 ? "You have " + inr(a.surplus) + " left over each month." : "Nothing is left over each month right now.") + "</p>" +
      '<div class="grid2"><div class="fields">' +
      (loans.length ? '<div class="field"><label for="wi-loan">Extra payment towards</label><select id="wi-loan">' + loans.map(function (l) {
        return '<option value="' + esc(l.lid || l.type) + '">' + esc(l.type) + " loan (" + inr(l.outstanding) + ")</option>"; }).join("") + "</select>" +
        '<input type="range" id="wi-extra" min="0" max="' + cap + '" step="' + step + '" value="0"><p class="echo" id="wi-extra-v">₹0 a month</p></div>' : "") +
      '<div class="field"><label for="wi-sip">Increase SIPs by</label><input type="range" id="wi-sip" min="0" max="' + cap + '" step="' + step + '" value="0">' +
      '<p class="echo" id="wi-sip-v">₹0 a month</p></div>' +
      '<div class="field"><label for="wi-trip">A trip or big purchase costing</label><div class="amount-wrap"><span>₹</span><input type="text" inputmode="decimal" id="wi-trip" placeholder="e.g. 80000 or 1.2 lakh"></div>' +
      '<p class="echo" id="wi-trip-v"></p></div>' +
      '<div class="field"><label for="wi-months">Months from now</label><input type="number" id="wi-months" min="1" max="60" value="10"></div>' +
      '</div><div class="wi-out" id="wi-out" aria-live="polite"></div></div></section>' +
      '<section class="card"><h2>Got a lump sum?</h2><p class="mute small">A bonus, gift or FD maturity? See where it should go, in the same order as your monthly plan.</p>' +
      '<div class="field"><label for="ls-amt">Amount</label><div class="amount-wrap"><span>₹</span><input type="text" inputmode="decimal" id="ls-amt" placeholder="e.g. 2 lakh"></div>' +
      '<p class="echo" id="ls-echo"></p></div><div id="ls-out"></div></section>';
  }

  function bindTools(p, a) {
    var cc = (p.prefs && p.prefs.closeCall) || "split";
    function val(id) { var el = $(id); return el ? Number(el.value) || 0 : 0; }
    function update() {
      var trip = Engine.parseAmount($("wi-trip").value);
      $("wi-trip-v").textContent = trip === null ? "" : isNaN(trip) ? "Could not read this. Try 80000 or 1.2 lakh." : "= " + inr(trip);
      if ($("wi-extra")) $("wi-extra-v").textContent = inr(val("wi-extra")) + " a month";
      $("wi-sip-v").textContent = inr(val("wi-sip")) + " a month";
      var r = Planner.simulate(p, a, { loanId: $("wi-loan") ? $("wi-loan").value : null, extraLoan: val("wi-extra"), sipIncrease: val("wi-sip"),
        tripCost: trip && !isNaN(trip) ? trip : 0, tripMonths: val("wi-months") });
      var out = [];
      r.warnings.forEach(function (w) { out.push('<div class="warn-box"><p>' + esc(w) + "</p></div>"); });
      if (r.loan) out.push('<div class="wi-item"><h3>' + esc(r.loan.type) + " loan</h3><p>" + (val("wi-extra")
        ? "Debt-free by <strong>" + esc(r.loan.withDate) + "</strong> instead of " + esc(r.loan.baseDate) + ": " + r.loan.monthsSaved + " months sooner and " +
          inr(r.loan.interestSaved) + " less interest."
        : "At your current EMI you are debt-free by <strong>" + esc(r.loan.baseDate) + "</strong>. Move the slider to pay extra.") + "</p></div>");
      if (r.loanNote) out.push('<div class="wi-item"><p>' + esc(r.loanNote) + "</p></div>");
      if (r.sip) out.push('<div class="wi-item"><h3>Extra SIP</h3><p>' + inr(val("wi-sip")) + " more a month could grow to <strong>" + inr(r.sip.value) + "</strong> in " +
        r.sip.years + " years (" + inr(r.sip.invested) + " invested, at an assumed " + r.sip.rate + "% a year after tax).</p></div>");
      if (r.trip) {
        var t = '<div class="wi-item"><h3>Your trip</h3><p>Save <strong>' + inr(r.trip.monthly) + "</strong> a month for " + val("wi-months") + " months in an RD or liquid fund.</p>";
        if (r.trip.flag) t += '<p class="warn-text">' + esc(r.trip.flag) + " You can still go; here is what it costs you.</p>";
        if (r.trip.loanMonths > 0) t += "<p>Putting that money into your loan instead would close it " + r.trip.loanMonths + " months sooner and save " + inr(r.trip.loanInterest) + " in interest.</p>";
        if (r.trip.efWith !== undefined) t += "<p>Your emergency fund reaches 6 months in " + (isFinite(r.trip.efWith) ? r.trip.efWith + " months" : "never at this rate") +
          " with the trip, " + (isFinite(r.trip.efWithout) ? r.trip.efWithout + " months" : "never") + " without it.</p>";
        out.push(t + "</div>");
      }
      if (!out.length) out.push('<p class="mute small">Results appear here as you move the sliders or enter a trip cost.</p>');
      $("wi-out").innerHTML = out.join("");
    }
    ["wi-loan", "wi-extra", "wi-sip", "wi-trip", "wi-months"].forEach(function (id) { if ($(id)) $(id).addEventListener("input", update); });
    update();
    $("ls-amt").addEventListener("input", function () {
      var n = Engine.parseAmount(this.value), out = $("ls-out");
      $("ls-echo").textContent = n === null ? "" : isNaN(n) ? "Could not read this. Try 200000 or 2 lakh." : "= " + inr(n);
      if (!n || isNaN(n)) { out.innerHTML = ""; return; }
      var pl = Planner.plan(p, a, { mode: "lump", amount: n, closeCall: cc });
      out.innerHTML = '<ol class="plan-list">' + pl.items.map(function (it) {
        return '<li><span class="plan-amt num">' + inr(it.amount) + "</span><div><strong>" + esc(it.title) + '</strong><p class="small mute">' + esc(it.reason) + "</p></div></li>";
      }).join("") + "</ol>" + pl.warnings.map(function (w) { return '<p class="small warn-text">' + esc(w) + "</p>"; }).join("");
    });
    app.querySelectorAll("[data-cc]").forEach(function (b) {
      b.onclick = function () {
        if (!me || p !== me) return;
        me.prefs = me.prefs || {}; me.prefs.closeCall = b.dataset.cc; Store.saveMine(me);
        var y = window.scrollY; renderOwnDashboard(); window.scrollTo(0, y);
      };
    });
    if ($("checkin")) $("checkin").onclick = function () { personalView = "checkin"; renderCheckin(); top(); };
  }

  // ---------- monthly check-in ----------
  function renderCheckin(monthArg) {
    var cur = Planner.currentMonth();
    var months = [0, 1, 2].map(function (k) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); });
    var month = monthArg || cur;
    var existing = (me.checkins || []).find(function (c) { return c.month === month; });
    var a = Engine.analyzeProfile(me), sp = me.spending || {};
    var usual = a.spendBasis === "actual" ? Engine.recentCheckins(me, 3) : null;
    function usualOf(k) {
      if (!usual) return Engine.num(sp[k]);
      return Math.round(usual.reduce(function (s, c) { return s + Engine.num(c.spending && c.spending[k]); }, 0) / usual.length);
    }
    function amt(id, value, placeholder) {
      return '<div class="amount-wrap"><span>₹</span><input type="text" inputmode="decimal" class="ck-amt" id="' + id + '" value="' + esc(indian(value)) +
        '" placeholder="' + esc(placeholder ? indian(placeholder) : "0") + '"></div><p class="echo" id="' + id + '-echo"></p>';
    }
    var loans = (me.loans || []).filter(function (l) { return Engine.num(l.outstanding) || Engine.num(l.emi); });
    var h = topbar('<button class="btn ghost" id="to-dash">Back to dashboard</button>') + '<main class="page narrow"><form class="card" id="ck" novalidate>' +
      '<p class="eyebrow">Monthly check-in</p><h1>How did this month go?</h1>' +
      '<div class="field"><label for="ck-month">Month</label><select id="ck-month">' + months.map(function (m) {
        return '<option value="' + m + '"' + (m === month ? " selected" : "") + ">" + Planner.monthName(m) +
          ((me.checkins || []).some(function (c) { return c.month === m; }) ? " (done, edit)" : "") + "</option>"; }).join("") + "</select></div>" +
      '<p class="group-title">Spending this month</p><p class="small mute">Grey numbers are your usual amounts. Your bank or UPI app history helps.</p>' +
      '<div><button type="button" class="btn ghost" id="ck-usual">Fill in my usual amounts</button></div>' +
      Engine.SPEND_CATS.map(function (c) {
        var v = existing && existing.spending ? existing.spending[c.key] : undefined;
        return '<div class="field"><label for="ck-s-' + c.key + '">' + esc(c.label) + ' <span class="per">' + (c.kind === "need" ? "need" : "want") + "</span></label>" +
          amt("ck-s-" + c.key, v, usualOf(c.key)) + "</div>";
      }).join("");
    if (loans.length) h += '<p class="group-title">Loans</p>' + loans.map(function (l) {
      var e = existing && existing.loans && existing.loans[l.lid] || {};
      var emi = e.emi !== undefined ? e.emi : Planner.inRepayment(l) ? Engine.num(l.emi) : 0;
      return '<div class="item" data-lid="' + esc(l.lid) + '"><h3>' + esc(l.type) + " loan</h3>" +
        '<div class="field"><label for="ck-emi-' + l.lid + '">' + (l.type === "Credit card" ? "Paid towards the card" : "EMI paid") + "</label>" + amt("ck-emi-" + l.lid, emi) + "</div>" +
        '<div class="field"><label for="ck-extra-' + l.lid + '">Extra payment</label>' + amt("ck-extra-" + l.lid, e.extra) + "</div>" +
        '<div class="field"><label for="ck-bal-' + l.lid + '">Balance now</label>' + amt("ck-bal-" + l.lid, e.balance) +
        '<p class="hint" id="ck-bal-hint-' + l.lid + '">Estimated from your payment. Change it if your bank app shows a different number.</p></div></div>';
    }).join("");
    h += '<p class="group-title">Investments and money in</p>' +
      '<div class="field"><label for="ck-sip">SIPs and RDs paid this month</label>' + amt("ck-sip", existing ? existing.sip : Engine.num(sp.sip)) + "</div>" +
      '<div class="field"><label for="ck-extra-in">Extra money received (bonus, gift, refund)</label>' + amt("ck-extra-in", existing && existing.extraIncome) + "</div>" +
      '<div class="field"><label for="ck-bank">Savings account balance today <span class="per">optional</span></label>' + amt("ck-bank", existing && existing.bank) +
      '<p class="hint">Keeps your emergency fund figure up to date.</p></div>' +
      '<p class="err-box" id="ck-err" hidden></p><div class="wiz-nav"><button type="button" class="btn quiet" id="ck-cancel">Cancel</button>' +
      '<button type="submit" class="btn big">Save check-in</button></div></form></main>';
    app.innerHTML = h;

    function parse(id) { var el = $(id); return el ? Engine.parseAmount(el.value) : null; }
    // Balance estimate follows the payment until the person types their own balance.
    var touched = {};
    function estimate(l) {
      if (touched[l.lid]) return;
      var paid = (parse("ck-emi-" + l.lid) || 0) + (parse("ck-extra-" + l.lid) || 0);
      $("ck-bal-" + l.lid).value = indian(Planner.nextBalance(l, isNaN(paid) ? 0 : paid));
    }
    loans.forEach(function (l) { var e = existing && existing.loans && existing.loans[l.lid]; if (e && e.balance !== undefined) touched[l.lid] = true; else estimate(l); });
    $("ck").addEventListener("input", function (e) {
      var t = e.target;
      if (t.classList.contains("ck-amt")) {
        var n = Engine.parseAmount(t.value), o = $(t.id + "-echo");
        o.textContent = n === null ? "" : isNaN(n) ? "Could not read this. Try 4500 or 4.5k." : "= " + inr(n);
        o.className = n !== null && isNaN(n) ? "echo err" : "echo";
        $("ck-err").hidden = true;
      }
      var lid = t.id.replace(/^ck-(emi|extra|bal)-/, "");
      if (/^ck-bal-/.test(t.id)) touched[lid] = true;
      else if (/^ck-(emi|extra)-/.test(t.id)) { var l = loans.find(function (x) { return x.lid === lid; }); if (l) estimate(l); }
    });
    $("ck-month").onchange = function () { renderCheckin(this.value); };
    $("ck-usual").onclick = function () {
      Engine.SPEND_CATS.forEach(function (c) { var el = $("ck-s-" + c.key), u = usualOf(c.key); if (!el.value && u) el.value = indian(u); });
    };
    $("to-dash").onclick = $("ck-cancel").onclick = function () { personalView = "dashboard"; render(); top(); };
    $("ck").onsubmit = function (e) {
      e.preventDefault();
      if (app.querySelector(".echo.err")) { $("ck-err").textContent = "Fix the amounts marked in red, or clear them."; $("ck-err").hidden = false; return; }
      var spending = {};
      Engine.SPEND_CATS.forEach(function (c) { var n = parse("ck-s-" + c.key); if (n) spending[c.key] = n; });
      if (!Object.keys(spending).length) { $("ck-err").textContent = "Enter at least one spending amount, or use \"Fill in my usual amounts\"."; $("ck-err").hidden = false; return; }
      var ck = { month: $("ck-month").value, spending: spending, loans: {}, savedAt: new Date().toISOString() };
      loans.forEach(function (l) {
        var bal = parse("ck-bal-" + l.lid);
        ck.loans[l.lid] = { emi: parse("ck-emi-" + l.lid) || 0, extra: parse("ck-extra-" + l.lid) || 0 };
        if (bal !== null && !isNaN(bal)) ck.loans[l.lid].balance = bal;
      });
      ["sip", "extraIncome", "bank"].forEach(function (k) {
        var n = parse({ sip: "ck-sip", extraIncome: "ck-extra-in", bank: "ck-bank" }[k]); if (n !== null && !isNaN(n)) ck[k] = n; });
      me.checkins = (me.checkins || []).filter(function (c) { return c.month !== ck.month; }).concat([ck]);
      // Only the latest month moves the current balances.
      var latest = me.checkins.map(function (c) { return c.month; }).sort().pop();
      if (ck.month === latest) {
        loans.forEach(function (l) { if (ck.loans[l.lid].balance !== undefined) l.outstanding = ck.loans[l.lid].balance; });
        if (ck.bank !== undefined) { me.assets = me.assets || {}; me.assets.savings = ck.bank; }
      }
      Store.saveMine(me); personalView = "dashboard"; render(); top();
    };
  }

  // =====================================================================
  // ADVISOR SIDE (#advisor)
  // =====================================================================
  var MOCK = [
    { name: "Arjun Malhotra", city: "Mumbai", age: 52, income: 48000000, aum: 185000000, risk: "Balanced", regime: "New" },
    { name: "Priya Venkataraman", city: "Bengaluru", age: 44, income: 32000000, aum: 96000000, risk: "Aggressive", regime: "New" },
    { name: "Rajiv Khanna", city: "New Delhi", age: 61, income: 21000000, aum: 142000000, risk: "Conservative", regime: "Old" },
    { name: "Ananya Iyer", city: "Chennai", age: 38, income: 18500000, aum: 41000000, risk: "Aggressive", regime: "New" },
    { name: "Vikram Singhania", city: "Kolkata", age: 57, income: 27500000, aum: 118000000, risk: "Balanced", regime: "Old" },
    { name: "Meera Deshpande", city: "Pune", age: 49, income: 15500000, aum: 63000000, risk: "Balanced", regime: "New" }
  ];
  // Fictional profile for demos: a young professional with an education loan, a credit card balance and a trip planned.
  var SAMPLE = { id: "sample", version: 2, createdAt: "2026-07-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z",
  consentAt: "2026-07-01T10:00:00.000Z", completedAt: "2026-07-01T10:30:00.000Z", skipped: {}, prefs: { closeCall: "split" },
  about: { name: "Ananya Rao (sample)", age: 27, city: "Bengaluru", occupation: "Salaried", spouseDependent: "na", children: 0, parents: 0, regime: "New" },
  income: { salary: 95000, annualGross: 1400000 },
  spending: { rent: 22000, groceries: 7000, utilities: 3000, transport: 4000, health: 1000, dining: 6000, shopping: 5000, entertainment: 2000, other: 2000, sip: 5000 },
  assets: { savings: 80000, fd: 50000, equityMf: 120000, epf: 150000 },
  loans: [{ lid: "L1", type: "Education", outstanding: 870000, emi: 14000, rate: 9.5, rateType: "Floating", inRepayment: "yes", yearsLeft: 7 },
    { lid: "L2", type: "Credit card", outstanding: 12000, emi: 0, rate: 36 }],
  insurance: { employerHealth: 500000 },
  goals: [{ type: "Travel", name: "Goa trip", amount: 80000, years: 1, saved: 0 }, { type: "Retirement", amount: 15000000, years: 33, saved: 0 }],
  risk: { drop: "wait", horizon: "long" },
  checkins: [
    { month: "2026-07", spending: { rent: 22000, groceries: 6800, utilities: 2900, transport: 3800, health: 600, dining: 5500, shopping: 4200, entertainment: 1800, other: 1500 },
      loans: { L1: { emi: 14000, extra: 0, balance: 900000 }, L2: { emi: 0, extra: 0, balance: 15000 } }, sip: 5000 },
    { month: "2026-08", spending: { rent: 22000, groceries: 7200, utilities: 3100, transport: 4100, health: 1200, dining: 6400, shopping: 5600, entertainment: 2000, other: 2200 },
      loans: { L1: { emi: 14000, extra: 0, balance: 893000 }, L2: { emi: 0, extra: 0, balance: 18000 } }, sip: 5000 },
    { month: "2026-09", spending: { rent: 22000, groceries: 7100, utilities: 3000, transport: 4300, health: 900, dining: 9400, shopping: 4800, entertainment: 2300, other: 1900 },
      loans: { L1: { emi: 14000, extra: 5000, balance: 881000 }, L2: { emi: 0, extra: 0, balance: 12000 } }, sip: 5000, extraIncome: 0 }
  ] };

  function renderAdvisor() {
    var hidden = Store.isFamilyHidden();
    app.innerHTML = '<div class="adv"><aside class="side"><span class="brand">BharatWealth <span>Nexus</span></span><span class="tag">Advisor view</span>' +
      '<nav><button class="nav-btn" data-tab="family">Family profiles</button><button class="nav-btn" data-tab="demo">Demo clients</button></nav>' +
      '<div class="side-foot"><label class="switch"><input type="checkbox" id="hide-toggle"' + (hidden ? " checked" : "") + "> Hide family data</label>" +
      "<span>Hides real family profiles on this device, for example before a demo.</span>" +
      '<a href="#" id="to-personal">Open my own profile</a></div></aside><main class="adv-main" id="adv-main"></main></div>';
    app.querySelectorAll(".nav-btn").forEach(function (b) {
      b.onclick = function () { advTab = b.dataset.tab; detail = null; renderAdvMain(); top(); };
    });
    $("hide-toggle").onchange = function () {
      Store.setFamilyHidden(this.checked);
      if (this.checked && detail && detail.from === "family") { detail = null; advTab = "family"; }
      renderAdvMain();
    };
    $("to-personal").onclick = function (e) { e.preventDefault(); history.pushState("", "", location.pathname + location.search); personalView = null; render(); top(); };
    renderAdvMain();
  }

  function renderAdvMain() {
    var main = $("adv-main");
    var tab = detail ? detail.from : advTab;
    app.querySelectorAll(".nav-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
    if (detail) return renderDetail(main);
    if (advTab === "demo") return renderDemo(main);
    renderFamily(main);
  }

  function renderFamily(main) {
    if (Store.isFamilyHidden()) {
      main.innerHTML = '<h1>Family profiles</h1><div class="empty"><h2>Family data is hidden</h2>' +
        "<p>Profiles stay saved on this device but are not shown. Turn this off when you are done presenting.</p>" +
        '<button class="btn ghost" id="unhide">Show family data</button></div>';
      $("unhide").onclick = function () { Store.setFamilyHidden(false); $("hide-toggle").checked = false; renderAdvMain(); };
      return;
    }
    var list = Store.listFamily().sort(function (x, y) { return (y.updatedAt || "").localeCompare(x.updatedAt || ""); });
    main.innerHTML = '<div><h1>Family profiles</h1><p class="mute">Profiles your family sent you. They are stored only in this browser.</p></div>' +
      '<div class="drop" id="drop"><h3>Add or update a profile</h3>' +
      '<p class="small mute">Drop the .json or .xlsx file they sent, or choose it. A newer file from the same person replaces the older one.</p>' +
      '<div class="row"><label class="btn" for="file-in">Choose file</label><input type="file" id="file-in" accept=".json,.xlsx,application/json" hidden>' +
      '<button type="button" class="btn ghost" id="paste-toggle">Paste text instead</button></div>' +
      '<div id="paste-area" class="field" hidden><label for="paste-box">Text they sent (starts with BWN1:)</label>' +
      '<textarea class="code" id="paste-box"></textarea><div><button type="button" class="btn" id="paste-go">Import text</button></div></div>' +
      '<p class="status-line" id="imp-status"></p></div>' +
      (list.length ? '<section class="card"><div class="table-wrap"><table class="profile-list"><thead><tr><th>Name</th><th>Age · City</th>' +
        '<th class="r">Net worth</th><th class="r">Left over / month</th><th>Needs you</th><th>Last updated</th><th></th></tr></thead><tbody>' +
        list.map(function (p) {
          var a = Engine.analyzeProfile(p), fl = Planner.advisorFlags(p, a);
          var calls = fl.filter(function (f) { return f.level === "call"; }).length, acts = fl.filter(function (f) { return f.level === "act"; }).length;
          return "<tr><td><strong>" + esc((p.about && p.about.name) || "Unnamed") + "</strong></td><td>" + esc([p.about && p.about.age, p.about && p.about.city].filter(Boolean).join(" · ") || "-") +
            '</td><td class="r">' + inr(a.netWorth) + '</td><td class="r">' + inr(a.surplus) + "</td><td>" +
            (calls ? '<span class="status call">' + calls + " call" + (calls > 1 ? "s" : "") + "</span> " : "") +
            (acts ? '<span class="status bad">' + acts + " to act on</span>" : "") + (!calls && !acts ? '<span class="status good">All clear</span>' : "") +
            "</td><td>" + dateIN(p.updatedAt) + '</td><td><div class="row" style="flex-wrap:nowrap"><button class="btn ghost" data-open="' + esc(p.id) + '">Open</button>' +
            '<button class="btn quiet" data-del="' + esc(p.id) + '">Delete</button></div></td></tr>';
        }).join("") + "</tbody></table></div></section>"
        : '<div class="empty"><h2>No family profiles yet</h2><p>Send your family the site link without #advisor at the end. ' +
          "When they finish, they send you a profile file from their dashboard. Import it here.</p></div>");

    var drop = $("drop");
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0]); });
    $("file-in").onchange = function () { if (this.files[0]) importFile(this.files[0]); this.value = ""; };
    $("paste-toggle").onclick = function () { $("paste-area").hidden = !$("paste-area").hidden; };
    $("paste-go").onclick = function () { finishImport(Store.parseTransfer($("paste-box").value)); };
    main.querySelectorAll("[data-open]").forEach(function (b) {
      b.onclick = function () { detail = { profile: Store.getFamily(b.dataset.open), from: "family" }; renderAdvMain(); top(); };
    });
    main.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.armed) { Store.deleteFamily(b.dataset.del); renderAdvMain(); return; }
        b.dataset.armed = "1"; b.textContent = "Confirm delete"; b.className = "btn danger";
        setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Delete"; b.className = "btn quiet"; } }, 4000);
      };
    });
  }

  function importFile(file) {
    $("imp-status").textContent = "Reading " + file.name + "...";
    Exports.readImportFile(file).then(finishImport);
  }
  function finishImport(res) {
    if (res.error) { $("imp-status").textContent = res.error; return; }
    var r = Store.upsertFamily(res.profile), name = (res.profile.about && res.profile.about.name) || "Profile";
    if (!r.ok && r.reason === "older") { $("imp-status").textContent = "You already have a newer version of " + name + "'s profile. Nothing changed."; return; }
    if (!r.ok) { $("imp-status").textContent = "This browser blocked saving. Try a normal (not private) window."; return; }
    renderAdvMain();
    $("imp-status").textContent = (r.replaced ? "Updated " : "Added ") + name + ".";
  }

  function renderDetail(main) {
    var p = detail.profile;
    if (!p) { detail = null; return renderAdvMain(); }
    var a = Engine.analyzeProfile(p);
    main.innerHTML = '<div><button class="btn quiet" id="back-list">← ' + (detail.from === "demo" ? "Demo clients" : "All family profiles") + "</button></div>" +
      advisorPanel(p, a) + dashboardHtml(p, a, { own: false, label: detail.from === "demo" ? "Sample profile (fictional)" : "Family profile" });
    bindDashboard(p, a);
    bindAdvisorPanel(p, a);
    $("back-list").onclick = function () { advTab = detail.from; detail = null; renderAdvMain(); top(); };
  }

  var LEVEL = { call: ["call", "Needs your call"], act: ["bad", "Act now"], watch: ["warn", "Watch"] };
  function advisorPanel(p, a) {
    var flags = Planner.advisorFlags(p, a), note = p.advisor && p.advisor.lastDecision;
    return '<section class="card advisor-panel"><div class="spread"><h2>For you to review</h2>' +
      (note ? '<span class="mute small">You last advised: ' + esc(CC_LABEL[note.choice]) + " on " + esc(note.loan) + " loan, " + dateIN(p.advisor.at) + "</span>" : "") + "</div>" +
      (flags.length ? flags.map(function (f, i) {
        return '<div class="flag"><div class="row"><span class="status ' + LEVEL[f.level][0] + '">' + LEVEL[f.level][1] + "</span><strong>" + esc(f.title) + "</strong></div>" +
          '<p class="small">' + esc(f.detail) + "</p>" +
          (f.decision ? '<div class="row">' + ["prepay", "split", "invest"].map(function (c) {
            return '<button type="button" class="btn ghost" data-decide="' + c + '" data-flag="' + i + '">Advise: ' + CC_LABEL[c] + "</button>"; }).join("") + "</div>" +
            '<div id="msg-' + i + '" class="field" hidden><label for="msg-box-' + i + '">Message to send her</label><textarea class="code" id="msg-box-' + i + '"></textarea>' +
            '<div class="row"><button type="button" class="btn" data-copy="' + i + '">Copy message</button><span class="status-line" id="msg-st-' + i + '"></span></div></div>' : "") + "</div>";
      }).join("") : '<p class="mute">Nothing needs you right now.</p>') +
      '<p class="note">For now you send your advice yourself, on WhatsApp or by phone. In the live version it will appear on her dashboard.</p></section>';
  }
  function bindAdvisorPanel(p, a) {
    var flags = Planner.advisorFlags(p, a);
    app.querySelectorAll("[data-decide]").forEach(function (b) {
      b.onclick = function () {
        var i = b.dataset.flag, d = flags[i].decision;
        $("msg-box-" + i).value = Planner.decisionMessage(p, d, b.dataset.decide); $("msg-" + i).hidden = false;
        if (p.id !== "sample") Store.setAdvisorNote(p.id, { lastDecision: { loan: d.loan.type, choice: b.dataset.decide } });
      };
    });
    app.querySelectorAll("[data-copy]").forEach(function (b) {
      b.onclick = function () {
        var i = b.dataset.copy, box = $("msg-box-" + i);
        function fallback() { box.focus(); box.select(); $("msg-st-" + i).textContent = "Select all and copy."; }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(function () { $("msg-st-" + i).textContent = "Copied."; }, fallback);
        else fallback();
      };
    });
  }

  function renderDemo(main) {
    var aum = MOCK.reduce(function (s, c) { return s + c.aum; }, 0);
    main.innerHTML = '<div class="spread"><div><h1>Demo clients</h1><p class="mute">Fictional HNWI book for demonstrations.</p></div>' +
      '<div class="row"><button class="btn ghost" id="demo-xlsx">Export client book (.xlsx)</button><button class="btn" id="open-sample">Open sample dashboard</button></div></div>' +
      '<p class="status-line" id="demo-status"></p>' +
      '<div class="kpis">' + kpi("Total AUM managed", inr(aum), "Across " + MOCK.length + " clients", "lead") +
      kpi("Client count", String(MOCK.length), "Fictional HNWI book") + kpi("Average client AUM", inr(aum / MOCK.length), "Per client") + "</div>" +
      '<section class="card"><div class="table-wrap"><table><thead><tr><th>Client</th><th>City</th><th class="r">Age</th><th class="r">Annual income</th>' +
      '<th class="r">AUM</th><th>Risk</th><th>Tax regime</th></tr></thead><tbody>' + MOCK.map(function (c) {
        return "<tr><td>" + esc(c.name) + "</td><td>" + esc(c.city) + '</td><td class="r">' + c.age + '</td><td class="r">' + inr(c.income) +
          '</td><td class="r">' + inr(c.aum) + "</td><td>" + esc(c.risk) + "</td><td>" + esc(c.regime) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
    $("open-sample").onclick = function () { detail = { profile: SAMPLE, from: "demo" }; renderAdvMain(); top(); };
    $("demo-xlsx").onclick = function () {
      var btn = this; btn.disabled = true;
      Promise.resolve().then(function () { var f = Exports.clientBookXlsx(MOCK); return Exports.saveFile(f.filename, f.blob); })
        .then(function (r) { $("demo-status").textContent = r.msg; }, function (e) { $("demo-status").textContent = e.message; })
        .finally(function () { btn.disabled = false; });
    };
  }

  render();
})();
