/**
 * Turns the documents in docs/ into PDFs in docs/pdf/, for reading away from a
 * code editor.
 *
 *   node scripts/docs-to-pdf.mjs
 *
 * Markdown is rendered with `marked` (fetched on demand by npx) and printed by
 * the Chrome already installed on the machine, so there is nothing to install.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs");
const outDir = join(docsDir, "pdf");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error("Could not find Chrome. Set CHROME_PATH to its location and try again.");
  process.exit(1);
}

/** The shop's look: black and white, generous margins, readable at A4. */
const STYLE = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #191918; line-height: 1.62; font-size: 11.2pt; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 23pt; letter-spacing: -0.4px; margin: 0 0 4pt; }
  h1 + p { color: #63635d; margin-top: 0; }
  h2 { font-size: 14.5pt; margin: 20pt 0 6pt; padding-bottom: 4pt; border-bottom: 1px solid #ededeb; }
  h3 { font-size: 12pt; margin: 14pt 0 4pt; }
  p, li { orphans: 2; widows: 2; }
  ul, ol { padding-inline-start: 18pt; }
  li { margin: 2pt 0; }
  /* Printed marks rather than form controls: a checkbox does not print reliably. */
  li.task { list-style: none; margin-inline-start: -14pt; }
  .tick { display: inline-block; width: 12pt; font-weight: 700; color: #1a7f45; }
  .tick.todo { color: #b8b8b2; font-weight: 400; }
  a { color: #191918; text-decoration: underline; text-underline-offset: 2px; }
  code {
    font-family: "Cascadia Mono", Consolas, monospace; font-size: 9.6pt;
    background: #f7f7f6; padding: 1pt 3pt; border-radius: 3px;
  }
  pre {
    background: #f7f7f6; border: 1px solid #ededeb; border-radius: 6px;
    padding: 9pt 11pt; overflow: hidden; page-break-inside: avoid;
  }
  pre code { background: none; padding: 0; font-size: 9pt; line-height: 1.45; }
  blockquote {
    margin: 10pt 0; padding: 7pt 12pt; border-inline-start: 3px solid #d9d9d5;
    background: #f7f7f6; color: #3f3f3b;
  }
  table { border-collapse: collapse; width: 100%; margin: 10pt 0; font-size: 10.2pt; page-break-inside: avoid; }
  th, td { border: 1px solid #ededeb; padding: 5pt 8pt; text-align: start; vertical-align: top; }
  th { background: #f7f7f6; font-weight: 600; }
  hr { border: none; border-top: 1px solid #ededeb; margin: 18pt 0; }
  h2, h3 { page-break-after: avoid; }
  .footer { margin-top: 26pt; padding-top: 8pt; border-top: 1px solid #ededeb; color: #8c8c85; font-size: 8.8pt; }
`;

const today = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

mkdirSync(outDir, { recursive: true });
const staging = join(tmpdir(), `escape-docs-${Date.now()}`);
mkdirSync(staging, { recursive: true });

const pages = readdirSync(docsDir).filter((f) => f.endsWith(".md"));
if (pages.length === 0) {
  console.error("No documents found in docs/.");
  process.exit(1);
}

for (const page of pages) {
  const markdown = readFileSync(join(docsDir, page), "utf8");

  // Links between documents point at the PDFs once printed.
  const html = execFileSync("npx", ["--yes", "marked@12", "--gfm"], {
    input: markdown.replace(/\]\((?!https?:)([\w./-]+)\.md\)/g, "]($1.pdf)"),
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 10 * 1024 * 1024,
  });

  const printable = html
    .replace(/<li>(\s*)<input checked(?:="")? disabled(?:="")? type="checkbox"[^>]*>/g, '<li class="task">$1<span class="tick">✓</span>')
    .replace(/<li>(\s*)<input disabled(?:="")? type="checkbox"[^>]*>/g, '<li class="task">$1<span class="tick todo">○</span>');

  const name = page.replace(/\.md$/, "");
  const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Escape Barbershop — ${name}</title>
<style>${STYLE}</style></head>
<body>${printable}
<div class="footer">Escape Barbershop — ${name}.md · printed ${today}</div>
</body></html>`;

  const htmlPath = join(staging, `${name}.html`);
  writeFileSync(htmlPath, document, "utf8");

  execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--virtual-time-budget=3000",
      `--print-to-pdf=${join(outDir, `${name}.pdf`)}`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ],
    { stdio: "ignore" }
  );

  console.log(`docs/pdf/${name}.pdf`);
}

rmSync(staging, { recursive: true, force: true });
