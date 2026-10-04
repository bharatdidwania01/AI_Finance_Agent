/* File exports: personal PDF report (jsPDF), Excel workbook (SheetJS), profile transfer file, and import.
   Libraries are looked up at click time so a slow or fallback CDN load never breaks the rest of the app. */
(function () {
  "use strict";

  // Hosted on claude.ai the page must ask the viewer to save through the `downloads` capability;
  // anywhere else a normal browser download works.
  async function saveFile(filename, blob) {
    if (window.claude && typeof window.claude.use === "function") {
      var downloads = await window.claude.use("downloads");
      if (downloads) {
        try { await downloads.save({ filename: filename, data: blob }); return { ok: true, msg: "Saved " + filename + "." }; }
        catch (e) {
          if (e && e.code === "declined") return { ok: false, msg: "Download cancelled." };
          if (e && e.code === "rate_limited") return { ok: false, msg: "A save prompt is already open. Finish it, then try again." };
          return { ok: false, unavailable: true, msg: "Downloads are not available here. Use \"Copy as text\" instead." };
        }
      }
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return { ok: true, msg: "Downloaded " + filename + "." };
  }

  function slug(s) { return String(s || "").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profile"; }
  function pdfText(s) { return String(s).replace(/₹\s?/g, "Rs "); } // standard PDF fonts have no rupee glyph
  function dateIN(iso) { return (iso ? new Date(iso) : new Date()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  var inr = function (n) { return Engine.inr(Math.round(n || 0)); };
  var STATUS = { good: "Good", warn: "Needs attention", bad: "Act now", na: "Not applicable" };
  var STATUS_RGB = { good: [12, 130, 12], warn: [176, 116, 0], bad: [208, 59, 59], na: [110, 110, 110] };

  // ---------- PDF report ----------
  function reportPdf(p, a) {
    if (!window.jspdf) throw new Error("The PDF tool has not loaded. Check your internet connection and reload the page.");
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 44, y;
    var ink = [24, 34, 31], mute = [93, 106, 101], teal = [15, 107, 90], line = [221, 227, 223];
    var name = (p.about && p.about.name) || "Your";

    function header() {
      doc.setFillColor(15, 59, 51); doc.rect(0, 0, W, 58, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(255, 255, 255); doc.text("BharatWealth Nexus", M, 36);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text("Wealth report  |  " + dateIN(), W - M, 36, { align: "right" });
      y = 88;
    }
    function ensure(h) { if (y + h > H - M) { doc.addPage(); header(); } }
    function text(t, size, color, style, x, opts) {
      doc.setFont("helvetica", style || "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || ink);
      var lines = doc.splitTextToSize(pdfText(t), (opts && opts.width) || (W - 2 * M));
      ensure(lines.length * size * 1.35);
      doc.text(lines, x || M, y); y += lines.length * size * 1.35;
    }
    function heading(t) { y += 10; ensure(40); text(t, 12.5, teal, "bold"); y += 2; }
    // cols: [{label, width, align}] widths in fractions of content width
    function table(cols, rows, opts) {
      var cw = W - 2 * M, xs = [], x = M;
      cols.forEach(function (c) { xs.push(x); x += c.width * cw; });
      function row(cells, bold, color) {
        var wrapped = cells.map(function (c, i) { return doc.splitTextToSize(pdfText(c), cols[i].width * cw - 8); });
        var h = Math.max.apply(null, wrapped.map(function (w) { return w.length; })) * 12 + 8;
        ensure(h);
        doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 8 : 9.5);
        wrapped.forEach(function (w, i) {
          var col = cols[i], c = (color && color[i]) || (bold ? mute : ink);
          doc.setTextColor.apply(doc, c);
          if (col.align === "right") doc.text(w, xs[i] + col.width * cw - 4, y + 10, { align: "right" });
          else doc.text(w, xs[i], y + 10);
        });
        y += h; doc.setDrawColor.apply(doc, line); doc.line(M, y - 3, W - M, y - 3);
      }
      row(cols.map(function (c) { return c.label.toUpperCase(); }), true);
      rows.forEach(function (r) { row(r.cells || r, false, r.colors); });
      if (opts && opts.total) row(opts.total, true);
      y += 4;
    }

    header();
    text(name + (name === "Your" ? " wealth report" : ""), 18, ink, "bold"); y += 2;
    var ab = p.about || {};
    text([ab.age ? "Age " + ab.age : "", ab.city, ab.occupation, a.riskProfile + " investor", a.regime + " tax regime",
      "Last updated " + dateIN(p.updatedAt)].filter(Boolean).join("  |  "), 9.5, mute);
    y += 10;

    // KPI strip
    var kpis = [["Net worth", inr(a.netWorth)], ["Monthly surplus", inr(a.surplus)], ["Total loans", inr(a.totalLoans)],
      ["Emergency fund", a.emergencyMonths === null ? "-" : a.emergencyMonths.toFixed(1) + " months"]];
    var kw = (W - 2 * M - 3 * 10) / 4;
    ensure(56);
    kpis.forEach(function (k, i) {
      var x = M + i * (kw + 10);
      doc.setDrawColor.apply(doc, line); doc.roundedRect(x, y, kw, 48, 4, 4, "S");
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor.apply(doc, mute); doc.text(k[0].toUpperCase(), x + 8, y + 15);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor.apply(doc, ink); doc.text(pdfText(k[1]), x + 8, y + 36);
    });
    y += 62;

    heading("Health check");
    table([{ label: "Area", width: .22 }, { label: "Status", width: .16 }, { label: "Where you are", width: .2 }, { label: "What it means", width: .42 }],
      a.checks.map(function (c) { return { cells: [c.title, STATUS[c.status], c.value, c.detail], colors: [null, STATUS_RGB[c.status]] }; }));

    heading("Monthly cash flow");
    table([{ label: "Item", width: .7 }, { label: "Per month", width: .3, align: "right" }], [
      ["Income (including bonus spread over 12 months)", inr(a.monthlyIncome)], ["Spending (including insurance premiums)", "- " + inr(a.monthlySpend)],
      ["Loan EMIs", "- " + inr(a.monthlyEmi)], ["Existing SIPs and RDs", "- " + inr(a.monthlySip)]
    ], { total: ["Left over", inr(a.surplus)] });

    heading("What you own");
    table([{ label: "Category", width: .55 }, { label: "Value", width: .25, align: "right" }, { label: "Share", width: .2, align: "right" }],
      a.groups.filter(function (g) { return g.value; }).map(function (g) {
        return [g.label, inr(g.value), Math.round(g.value / a.totalAssets * 100) + "%"];
      }), { total: ["Total assets", inr(a.totalAssets), "100%"] });

    if (a.loans.length) {
      heading("What you owe");
      table([{ label: "Loan", width: .26 }, { label: "Outstanding", width: .22, align: "right" }, { label: "EMI", width: .18, align: "right" },
        { label: "Rate", width: .14, align: "right" }, { label: "Years left", width: .2, align: "right" }],
        a.loans.map(function (l) { return [l.type || "Loan", inr(l.outstanding), inr(l.emi), l.rate ? l.rate + "%" : "-", l.yearsLeft || "-"]; }),
        { total: ["Total", inr(a.totalLoans), inr(a.monthlyEmi), "", ""] });
    }

    var insr = p.insurance || {};
    if (!(p.skipped && p.skipped.insurance)) {
      heading("Insurance");
      table([{ label: "Cover", width: .7 }, { label: "Amount", width: .3, align: "right" }], [
        ["Term life", inr(insr.term)], ["Other life (LIC, endowment, ULIP)", inr(insr.otherLife)],
        ["Health, own policy", inr(insr.health)], ["Health, from employer", inr(insr.employerHealth)]]);
    }

    if (a.goals.length) {
      heading("Goals");
      table([{ label: "Goal", width: .26 }, { label: "Years", width: .1, align: "right" }, { label: "Cost today", width: .2, align: "right" },
        { label: "Cost then", width: .2, align: "right" }, { label: "Monthly SIP needed", width: .24, align: "right" }],
        a.goals.map(function (g) { return [g.name, String(g.years), inr(g.amount), inr(g.futureCost), inr(g.monthlyNeeded)]; }),
        { total: ["Total", "", "", "", inr(a.goalSip)] });
      var longGoal = a.goals.find(function (g) { return g.years > 3; });
      text("Costs grow at 6% a year for inflation. Assumed returns: 6.5% for goals within 3 years" +
        (longGoal ? ", " + Math.round(longGoal.rate * 100) + "% for longer goals (" + a.riskProfile.toLowerCase() + " investor)." : "."), 8.5, mute);
    }

    heading("Where to put your monthly surplus");
    text(a.investable ? "Suggested split of the " + inr(a.investable) + " you have left each month:" :
      "You have no surplus left each month right now. This is the split to use once you do:", 9.5);
    y += 4;
    table([{ label: "Asset class", width: .25 }, { label: "Fund type", width: .45 }, { label: "Share", width: .12, align: "right" },
      { label: "Per month", width: .18, align: "right" }],
      a.split.lines.map(function (l) { return [l.cls, l.name, l.pct + "%", a.investable ? inr(a.investable * l.pct / 100) : "-"]; }));
    if (a.split.taxInsight) { y += 2; text(a.split.taxInsight.text, 9); }

    y += 12;
    text("This report is generated from the figures entered and simple rules of thumb. It is not investment, tax or legal advice. " +
      "Tax rates are indicative for FY 2025-26. Mutual fund investments are subject to market risks; read all scheme-related documents carefully.", 7.5, mute);

    return { filename: "Wealth-Report-" + slug(name) + ".pdf", blob: doc.output("blob") };
  }

  // ---------- Excel workbook ----------
  var DATA_SHEET = "_profile_data";
  function reportXlsx(p, a) {
    if (!window.XLSX) throw new Error("The Excel tool has not loaded. Check your internet connection and reload the page.");
    var X = window.XLSX, wb = X.utils.book_new(), ab = p.about || {};
    function sheet(name, aoa, widths) {
      var ws = X.utils.aoa_to_sheet(aoa); ws["!cols"] = (widths || []).map(function (w) { return { wch: w }; });
      X.utils.book_append_sheet(wb, ws, name);
    }
    sheet("Summary", [
      ["BharatWealth Nexus - Wealth report"], ["Name", ab.name || ""], ["Age", ab.age || ""], ["City", ab.city || ""],
      ["Risk profile", a.riskProfile], ["Tax regime", a.regime], ["Last updated", dateIN(p.updatedAt)], [],
      ["Net worth (INR)", Math.round(a.netWorth)], ["Total assets (INR)", Math.round(a.totalAssets)], ["Total loans (INR)", Math.round(a.totalLoans)],
      ["Monthly income (INR)", Math.round(a.monthlyIncome)], ["Monthly spending (INR)", Math.round(a.monthlySpend)],
      ["Monthly EMIs (INR)", Math.round(a.monthlyEmi)], ["Monthly SIPs (INR)", Math.round(a.monthlySip)], ["Monthly surplus (INR)", Math.round(a.surplus)],
      [], ["Health check", "Status", "Where you are", "What it means"]
    ].concat(a.checks.map(function (c) { return [c.title, STATUS[c.status], c.value.replace(/₹/g, "Rs "), c.detail.replace(/₹/g, "Rs ")]; })),
      [26, 18, 22, 90]);

    var inc = p.income || {}, sp = p.spending || {}, as = p.assets || {}, insr = p.insurance || {};
    function rowsFor(stepId, obj) {
      var step = Questions.STEPS.find(function (s) { return s.id === stepId; });
      return Questions.fieldsOf(step).map(function (f) {
        return [f.label + (f.per ? " (per " + f.per + ")" : ""), Number(obj[f.key]) || 0];
      });
    }
    sheet("Income", [["Item", "Amount (INR)"]].concat(rowsFor("income", inc)), [46, 16]);
    sheet("Spending", [["Item", "Amount (INR)"]].concat(rowsFor("spending", sp)), [46, 16]);
    sheet("Assets", [["Item", "Value (INR)"]].concat(rowsFor("assets", as)).concat([[], ["Total assets", Math.round(a.totalAssets)]]), [46, 16]);
    sheet("Loans", [["Type", "Outstanding (INR)", "EMI (INR)", "Rate (%)", "Years left"]].concat((p.loans || []).map(function (l) {
      return [l.type || "", Number(l.outstanding) || 0, Number(l.emi) || 0, Number(l.rate) || 0, Number(l.yearsLeft) || 0];
    })), [18, 18, 12, 10, 10]);
    sheet("Insurance", [["Cover", "Amount (INR)"]].concat(rowsFor("insurance", insr)), [46, 16]);
    sheet("Goals", [["Goal", "Years", "Cost today (INR)", "Cost then (INR)", "Already saved (INR)", "Monthly SIP needed (INR)"]].concat(
      a.goals.map(function (g) { return [g.name, g.years, g.amount, g.futureCost, g.saved, g.monthlyNeeded]; })), [26, 8, 16, 16, 18, 22]);
    sheet("Suggested split", [["Asset class", "Fund type", "Share (%)", "Per month (INR)"]].concat(
      a.split.lines.map(function (l) { return [l.cls, l.name, l.pct, Math.round(a.investable * l.pct / 100)]; })), [16, 30, 10, 16]);

    // Hidden sheet carrying the full profile so this same file can be imported by the advisor.
    var json = Store.toJson(p), chunks = [];
    for (var i = 0; i < json.length; i += 30000) chunks.push([json.slice(i, i + 30000)]);
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(chunks), DATA_SHEET);
    wb.Workbook = { Sheets: wb.SheetNames.map(function (n) { return { Hidden: n === DATA_SHEET ? 1 : 0 }; }) };

    var buf = X.write(wb, { bookType: "xlsx", type: "array" });
    return { filename: "Wealth-Report-" + slug(ab.name) + ".xlsx",
      blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) };
  }

  function profileFile(p) {
    return { filename: "BharatWealth-Profile-" + slug(p.about && p.about.name) + ".json",
      blob: new Blob([Store.toJson(p)], { type: "application/json" }) };
  }

  // Reads a dropped/selected file (.json or the .xlsx above). Resolves {profile} or {error}.
  function readImportFile(file) {
    return new Promise(function (resolve) {
      var isXlsx = /\.xlsx$/i.test(file.name);
      var fr = new FileReader();
      fr.onerror = function () { resolve({ error: "Could not read that file." }); };
      fr.onload = function () {
        if (!isXlsx) return resolve(Store.parseTransfer(fr.result));
        if (!window.XLSX) return resolve({ error: "The Excel tool has not loaded. Check your internet connection and reload." });
        try {
          var wb = window.XLSX.read(new Uint8Array(fr.result), { type: "array" });
          var ws = wb.Sheets[DATA_SHEET];
          if (!ws) return resolve({ error: "This Excel file was not exported from BharatWealth Nexus." });
          var rows = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
          resolve(Store.parseTransfer(rows.map(function (r) { return r[0] || ""; }).join("")));
        } catch (e) { resolve({ error: "Could not read that Excel file." }); }
      };
      if (isXlsx) fr.readAsArrayBuffer(file); else fr.readAsText(file);
    });
  }

  // ---------- Demo client book (advisor demo tab) ----------
  function clientBookXlsx(clients) {
    if (!window.XLSX) throw new Error("The Excel tool has not loaded. Check your internet connection and reload the page.");
    var X = window.XLSX;
    var ws = X.utils.json_to_sheet(clients.map(function (c) {
      return { "Client": c.name, "City": c.city, "Age": c.age, "Annual Income (INR)": c.income, "AUM (INR)": c.aum, "Risk Profile": c.risk, "Tax Regime": c.regime };
    }));
    ws["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 6 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 11 }];
    var wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Demo clients");
    return { filename: "BharatWealth-Demo-Client-Book.xlsx",
      blob: new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) };
  }

  window.Exports = { saveFile: saveFile, reportPdf: reportPdf, reportXlsx: reportXlsx, profileFile: profileFile,
    readImportFile: readImportFile, clientBookXlsx: clientBookXlsx };
})();
