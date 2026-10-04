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
    ({ welcome: renderWelcome, wizard: renderWizard, review: renderReview, dashboard: renderOwnDashboard })[personalView]();
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
        me[step.id] = me[step.id] || []; me[step.id].push({}); delete me.skipped[step.id]; saveSoon(); rerenderFields(step);
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

    var acts = a.checks.filter(function (c) { return c.status === "bad"; }).length;
    var warns = a.checks.filter(function (c) { return c.status === "warn"; }).length;
    h += '<section class="card"><div class="spread"><h2>Health check</h2><span class="mute small">' +
      (acts ? acts + " to act on" : "Nothing urgent") + (warns ? ", " + warns + " to watch" : "") + "</span></div>" +
      '<div class="checks">' + a.checks.map(function (c) {
        return '<div class="check"><div class="top"><h3>' + esc(c.title) + "</h3>" + statusChip(c.status) + "</div>" +
          '<div class="val">' + esc(c.value) + '</div><p class="small mute">' + esc(c.detail) + "</p></div>";
      }).join("") + '</div><p class="note">Thresholds are common rules of thumb used by planners, not regulations.</p></section>';

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

    if (a.loans.length) h += '<section class="card"><h2>What you owe</h2><div class="table-wrap"><table><thead><tr><th>Loan</th><th class="r">Outstanding</th>' +
      '<th class="r">EMI</th><th class="r">Rate</th><th class="r">Years left</th></tr></thead><tbody>' + a.loans.map(function (l) {
        return "<tr><td>" + esc(l.type || "Loan") + '</td><td class="r">' + inr(l.outstanding) + '</td><td class="r">' + inr(l.emi) +
          '</td><td class="r">' + (l.rate ? esc(l.rate) + "%" : "-") + '</td><td class="r">' + (l.yearsLeft ? esc(l.yearsLeft) : "-") + "</td></tr>";
      }).join("") + '</tbody><tfoot><tr><td>Total</td><td class="r">' + inr(a.totalLoans) + '</td><td class="r">' + inr(a.monthlyEmi) +
      "</td><td></td><td></td></tr></tfoot></table></div></section>";

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

    var split = a.split;
    h += '<section class="card"><h2>' + (a.investable ? "Where to invest your " + inr(a.investable) + " each month" : "How to split future investments") + "</h2>" +
      (a.investable ? "" : '<p class="mute small">Nothing is left over each month right now. Use this split once there is.</p>') +
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
    $("dl-xlsx").onclick = function () { run(this, function () { return Exports.reportXlsx(p, a); }); };
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
  // Fictional profile for demos.
  var SAMPLE = { id: "sample", version: 1, createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-28T10:00:00.000Z",
    consentAt: "2026-09-01T10:00:00.000Z", completedAt: "2026-09-01T10:30:00.000Z", skipped: {},
    about: { name: "Rohan Mehta (sample)", age: 38, city: "Pune", occupation: "Salaried", spouseDependent: "yes", children: 2, parents: 0, regime: "New" },
    income: { salary: 185000, interest: 4000, bonus: 300000, annualGross: 3100000 },
    spending: { household: 70000, education: 18000, other: 10000, premiums: 55000, sip: 25000 },
    assets: { savings: 250000, fd: 400000, equityMf: 1800000, debtMf: 200000, stocks: 350000, epf: 1100000, ppf: 450000, gold: 500000, home: 11000000 },
    loans: [{ type: "Home", outstanding: 5200000, emi: 46000, rate: 8.5, yearsLeft: 15 }, { type: "Car", outstanding: 450000, emi: 14500, rate: 9.2, yearsLeft: 3 },
      { type: "Credit card", outstanding: 60000, emi: 0, rate: 42 }],
    insurance: { term: 15000000, employerHealth: 500000, health: 500000 },
    goals: [{ type: "Child's education", name: "Kids' higher education", amount: 4000000, years: 10, saved: 300000 },
      { type: "Retirement", amount: 50000000, years: 22, saved: 0 }],
    risk: { drop: "wait", horizon: "long" } };

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
        '<th class="r">Net worth</th><th class="r">Left over / month</th><th>Health</th><th>Last updated</th><th></th></tr></thead><tbody>' +
        list.map(function (p) {
          var a = Engine.analyzeProfile(p);
          return "<tr><td><strong>" + esc((p.about && p.about.name) || "Unnamed") + "</strong></td><td>" + esc([p.about && p.about.age, p.about && p.about.city].filter(Boolean).join(" · ") || "-") +
            '</td><td class="r">' + inr(a.netWorth) + '</td><td class="r">' + inr(a.surplus) + "</td><td>" +
            (a.alerts ? statusChip("bad").replace("Act now", a.alerts + " to act on") : statusChip("good").replace("Good", "No urgent issues")) +
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
      dashboardHtml(p, a, { own: false, label: detail.from === "demo" ? "Sample profile (fictional)" : "Family profile" });
    bindDashboard(p, a);
    $("back-list").onclick = function () { advTab = detail.from; detail = null; renderAdvMain(); top(); };
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
