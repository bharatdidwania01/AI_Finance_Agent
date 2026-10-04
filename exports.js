/* File exports: PDF proposal (jsPDF) and Excel client book (SheetJS). Libraries are looked up at
   click time so a slow or fallback CDN load never breaks the rest of the app. */
(function () {
  "use strict";

  // Hosted on claude.ai the page must ask the viewer to save through the `downloads` capability;
  // opened as a local file, a normal browser download works.
  async function saveFile(filename, blob) {
    if (window.claude && typeof window.claude.use === "function") {
      var downloads = await window.claude.use("downloads");
      if (downloads) {
        try { await downloads.save({ filename: filename, data: blob }); return "Saved " + filename + "."; }
        catch (e) {
          if (e && e.code === "declined") return "Download cancelled.";
          if (e && e.code === "rate_limited") return "A save prompt is already open. Finish it, then try again.";
          return "Downloads are not available in this view.";
        }
      }
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    return "Downloaded " + filename + ".";
  }

  function slug(s) { return String(s).trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client"; }
  // Standard PDF fonts have no rupee glyph.
  function pdfText(s) { return String(s).replace(/₹\s?/g, "Rs "); }
  function today() { return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }

  function proposalPdf(input, result) {
    if (!window.jspdf) throw new Error("The PDF library has not loaded. Check your internet connection and reload.");
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48, y = M;
    var ink = [24, 34, 31], mute = [93, 106, 101], teal = [15, 107, 90];

    function para(text, size, color, style) {
      doc.setFont("helvetica", style || "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || ink);
      var lines = doc.splitTextToSize(pdfText(text), W - 2 * M);
      if (y + lines.length * size * 1.35 > H - M) { doc.addPage(); y = M; }
      doc.text(lines, M, y); y += lines.length * size * 1.35;
    }

    doc.setFillColor(15, 59, 51); doc.rect(0, 0, W, 64, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(255, 255, 255);
    doc.text("BharatWealth Nexus", M, 40);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("Portfolio Proposal  |  " + today(), W - M, 40, { align: "right" });
    y = 98;

    para("Prepared for " + input.name.trim(), 16, ink, "bold"); y += 4;
    para("Age " + input.age + "  |  Annual income " + Engine.inr(input.income) + "  |  Corpus " + Engine.inr(input.corpus) +
      "  |  " + input.risk + " risk  |  " + input.regime + " tax regime", 10, mute);
    y += 14;

    // Allocation bar
    var x = M, barW = W - 2 * M;
    result.lines.forEach(function (l) {
      var w = barW * l.pct / 100; doc.setFillColor.apply(doc, PDF_COLORS[l.name] || teal); doc.rect(x, y, w, 12, "F"); x += w;
    });
    y += 30;

    // Allocation table
    var cols = [M, M + 110, W - M - 120, W - M];
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor.apply(doc, mute);
    doc.text("ASSET CLASS", cols[0], y); doc.text("INSTRUMENT", cols[1], y);
    doc.text("WEIGHT", cols[2], y, { align: "right" }); doc.text("AMOUNT", cols[3], y, { align: "right" });
    y += 8; doc.setDrawColor(221, 227, 223); doc.line(M, y, W - M, y); y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor.apply(doc, ink);
    result.lines.forEach(function (l) {
      doc.setFillColor.apply(doc, PDF_COLORS[l.name] || teal); doc.rect(cols[1] - 12, y - 7, 7, 7, "F");
      doc.text(l.cls, cols[0], y); doc.text(l.name, cols[1], y);
      doc.text(l.pct + "%", cols[2], y, { align: "right" }); doc.text(pdfText(Engine.inr(l.amount)), cols[3], y, { align: "right" });
      y += 20;
    });
    doc.line(M, y - 10, W - M, y - 10); y += 16;

    if (result.taxInsight) {
      para("Tax efficiency: Arbitrage Funds vs Fixed Deposits", 12, teal, "bold"); y += 2;
      para(result.taxInsight.text, 10); y += 12;
    }
    para("Notes", 12, teal, "bold"); y += 2;
    result.notes.forEach(function (n) { para("- " + n, 10); y += 2; });
    y += 14;
    para("Illustrative proposal generated from mock assumptions. Tax rates are indicative for FY 2025-26 and ignore surcharge and " +
      "deductions other than the standard deduction. Not investment, tax or legal advice. Mutual fund investments are subject to " +
      "market risks; read all scheme-related documents carefully.", 8, mute);

    return { filename: "Proposal-" + slug(input.name) + ".pdf", blob: doc.output("blob") };
  }

  var PDF_COLORS = {
    "Nifty 50 Index Fund": [15, 107, 90], "Nifty Next 50 Index Fund": [95, 174, 155], "Short-Term Debt Fund": [52, 80, 143],
    "Arbitrage Fund": [138, 164, 221], "Sovereign Gold Bonds (SGB)": [184, 137, 43]
  };

  function clientBookXlsx(clients) {
    if (!window.XLSX) throw new Error("The Excel library has not loaded. Check your internet connection and reload.");
    var rows = clients.map(function (c) {
      return { "Client": c.name, "City": c.city || "", "Age": c.age, "Annual Income (INR)": c.income, "AUM (INR)": c.aum,
        "Risk Profile": c.risk, "Tax Regime": c.regime, "Source": c.isNew ? "Client Portal" : "Book" };
    });
    var total = clients.reduce(function (s, c) { return s + c.aum; }, 0);
    var ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 6 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 11 }, { wch: 14 }];
    var summary = XLSX.utils.aoa_to_sheet([
      ["BharatWealth Nexus - Client Book"], ["Exported", today()], [],
      ["Total AUM (INR)", total], ["Client count", clients.length], ["Average AUM (INR)", Math.round(total / clients.length)]
    ]);
    summary["!cols"] = [{ wch: 22 }, { wch: 18 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summary, "Summary");
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    var buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    return { filename: "BharatWealth-Client-Book.xlsx", blob: blob };
  }

  window.Exports = { saveFile: saveFile, proposalPdf: proposalPdf, clientBookXlsx: clientBookXlsx };
})();
