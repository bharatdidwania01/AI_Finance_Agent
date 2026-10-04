// Bundles the site into one self-contained file (dist/bharatwealth-nexus.html) for hosting as a
// claude.ai artifact: CSS and local JS are inlined, and the html/head/body skeleton is dropped
// because the host supplies it. Run: node build.js
const fs = require("fs");
const src = fs.readFileSync("index.html", "utf8");
const between = (a, b) => src.slice(src.indexOf(a) + a.length, src.indexOf(b));
const inline = (html) => html
  .replace(/<link rel="stylesheet" href="styles\.css">/, () => "<style>\n" + fs.readFileSync("styles.css", "utf8") + "</style>")
  .replace(/<script src="(engine|questions|store|exports|app)\.js"><\/script>/g, (_, f) => "<script>\n" + fs.readFileSync(f + ".js", "utf8") + "</script>");
const out = inline(between("<!-- BUILD:HEAD-START -->", "<!-- BUILD:HEAD-END -->")) +
  inline(between("<!-- BUILD:BODY-START -->", "<!-- BUILD:BODY-END -->"));
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/bharatwealth-nexus.html", out.trim() + "\n");
console.log("Wrote dist/bharatwealth-nexus.html (" + out.length + " bytes)");
