/* UI layer: view switching, state, rendering. Finance logic lives in engine.js, file output in exports.js. */
(function () {
  "use strict";
  var STORE_KEY = "bwn.clients.v1";

  var MOCK = [
    { name: "Arjun Malhotra", city: "Mumbai", age: 52, income: 48000000, aum: 185000000, risk: "Balanced", regime: "New" },
    { name: "Priya Venkataraman", city: "Bengaluru", age: 44, income: 32000000, aum: 96000000, risk: "Aggressive", regime: "New" },
    { name: "Rajiv Khanna", city: "New Delhi", age: 61, income: 21000000, aum: 142000000, risk: "Conservative", regime: "Old" },
    { name: "Ananya Iyer", city: "Chennai", age: 38, income: 18500000, aum: 41000000, risk: "Aggressive", regime: "New" },
    { name: "Vikram Singhania", city: "Kolkata", age: 57, income: 27500000, aum: 118000000, risk: "Balanced", regime: "Old" },
    { name: "Meera Deshpande", city: "Pune", age: 49, income: 15500000, aum: 63000000, risk: "Balanced", regime: "New" }
  ];

  // State: MOCK is constant; `added` holds portal submissions and persists per browser (best-effort).
  var added = load();
  var lastProposal = null; // { input, result } behind the current PDF button
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; } }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(added)); } catch (e) { /* storage unavailable */ } }
  function clients() { return MOCK.concat(added.map(function (c) { return Object.assign({ isNew: true }, c); })); }

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function renderAdvisor() {
    var list = clients();
    var aum = list.reduce(function (s, c) { return s + c.aum; }, 0);
    $("m-aum").textContent = Engine.inr(aum);
    $("m-count").textContent = list.length;
    $("m-avg").textContent = Engine.inr(aum / list.length);
    $("client-rows").innerHTML = list.map(function (c) {
      return "<tr><td>" + esc(c.name) + (c.isNew ? "<span class='new-flag'>New</span>" : "") + "</td><td>" + esc(c.city || "-") +
        "</td><td class='num'>" + c.age + "</td><td class='num'>" + Engine.inr(c.income) + "</td><td class='num'>" + Engine.inr(c.aum) +
        "</td><td><span class='pill " + esc(c.risk) + "'>" + esc(c.risk) + "</span></td><td>" + esc(c.regime) + "</td></tr>";
    }).join("");
  }

  var COLORS = { "Nifty 50 Index Fund": "--c-n50", "Nifty Next 50 Index Fund": "--c-next", "Short-Term Debt Fund": "--c-debt",
    "Arbitrage Fund": "--c-arb", "Sovereign Gold Bonds (SGB)": "--c-gold" };
  function color(name) { return "var(" + COLORS[name] + ")"; }

  function renderResult(input, r) {
    var bar = r.lines.map(function (l) {
      return "<div style='width:" + l.pct + "%;background:" + color(l.name) + "' title='" + esc(l.name) + " " + l.pct + "%'></div>";
    }).join("");
    var rows = r.lines.map(function (l) {
      return "<tr><td>" + esc(l.cls) + "</td><td><span class='sw' style='background:" + color(l.name) + "'></span>" + esc(l.name) +
        "</td><td class='num'>" + l.pct + "%</td><td class='num'>" + Engine.inr(l.amount) + "</td></tr>";
    }).join("");
    var html = "<div class='card'><div class='head' style='margin-bottom:0'><h3>Recommended portfolio for " + esc(input.name.trim()) + "</h3>" +
      "<button class='btn ghost' id='export-pdf' type='button'>Download proposal (PDF)</button></div>" +
      "<p class='status' id='pdf-status'></p>" +
      "<div class='alloc'>" + bar + "</div>" +
      "<div class='table-wrap'><table><thead><tr><th>Asset class</th><th>Instrument</th><th class='num'>Weight</th><th class='num'>Amount</th></tr></thead><tbody>" +
      rows + "</tbody></table></div></div>";
    if (r.taxInsight) {
      html += "<div class='card callout'><h3>Tax efficiency: Arbitrage Funds vs FDs</h3><p>" + esc(r.taxInsight.text) + "</p>" +
        "<p class='small'>Assumes a 7% pre-tax return, no surcharge and no exit load. Rates are indicative for FY 2025-26. Confirm current law with a tax professional.</p></div>";
    }
    html += "<div class='card'><h3>Notes</h3><ul>" + r.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul></div>";
    $("result").innerHTML = html;
    $("export-pdf").addEventListener("click", onPdf);
  }

  async function runExport(btn, statusEl, build) {
    btn.disabled = true; statusEl.textContent = "Preparing file...";
    try { var f = build(); statusEl.textContent = await Exports.saveFile(f.filename, f.blob); }
    catch (e) { statusEl.textContent = e.message || "Export failed."; }
    finally { btn.disabled = false; }
  }
  function onPdf() {
    if (!lastProposal) return;
    runExport($("export-pdf"), $("pdf-status"), function () { return Exports.proposalPdf(lastProposal.input, lastProposal.result); });
  }
  $("export-xlsx").addEventListener("click", function () {
    runExport($("export-xlsx"), $("xlsx-status"), function () { return Exports.clientBookXlsx(clients()); });
  });

  function show(view) {
    $("view-advisor").hidden = view !== "advisor";
    $("view-client").hidden = view !== "client";
    document.querySelectorAll(".nav-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.view === view); });
    if (view === "advisor") renderAdvisor();
  }
  document.querySelectorAll(".nav-btn").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.view); }); });

  $("client-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = {
      name: $("f-name").value, age: Number($("f-age").value), income: Number($("f-income").value),
      corpus: Number($("f-corpus").value), risk: $("f-risk").value,
      regime: document.querySelector("input[name=regime]:checked").value
    };
    var r = Engine.buildPortfolio(input);
    var err = $("form-error");
    if (r.errors.length) { err.textContent = r.errors.join(" "); err.hidden = false; return; }
    err.hidden = true;
    added.push({ name: input.name.trim(), city: "-", age: input.age, income: input.income, aum: input.corpus, risk: input.risk, regime: input.regime });
    save();
    lastProposal = { input: input, result: r };
    renderResult(input, r);
  });

  renderAdvisor();
})();
