export interface ReceiptShopSettings {
  shopName: string;
  shopPhone: string | null;
  shopAddress: string | null;
  receiptFooter: string | null;
  shopLogo: string | null;
}

export interface ReceiptItem {
  service: { name: string; arabicName: string | null };
  quantity: number;
  priceAtTime: number;
}

export interface ReceiptVisit {
  id: string;
  visitAt: string;
  customer: { name: string; phone: string | null };
  barber: { name: string };
  paymentMethod: "CASH" | "CARD" | "MIXED";
  cashAmount: number | null;
  cardAmount: number | null;
  discount: number;
  total: number;
  notes: string | null;
  sessionSequence: number | null;
  items: ReceiptItem[];
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtMoney(n: number): string {
  return n.toFixed(2);
}

const SEP = `<div style="border-top:1px dashed #000;margin:8px 0;"></div>`;

function buildReceiptBlock(
  visit: ReceiptVisit,
  shop: ReceiptShopSettings,
  items: ReceiptItem[],
  showTotals: boolean
): string {
  const receiptNo = visit.sessionSequence != null
    ? String(visit.sessionSequence)
    : visit.id.slice(-8).toUpperCase();
  const displayTotal = showTotals ? visit.total : items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);

  const logoHtml = shop.shopLogo
    ? `<img src="${shop.shopLogo}" alt="logo" style="width:240px;height:auto;max-height:200px;object-fit:contain;display:block;margin:0 auto 10px;" />`
    : "";

  const contactParts = [shop.shopPhone, shop.shopAddress].filter(Boolean);
  const contactHtml = contactParts.length
    ? `<div style="font-size:11px;color:#000;margin-top:2px;">${contactParts.join(" | ")}</div>`
    : "";

  const itemRows = items
    .map((item) => {
      const name = item.service.name;
      const lineTotal = item.priceAtTime * item.quantity;
      const qtyPart =
        item.quantity > 1
          ? `<span style="color:#000;font-size:10px;"> x${item.quantity} = $${fmtMoney(lineTotal)}</span>`
          : "";
      return `
      <tr>
        <td style="padding:3px 0;font-size:12px;color:#000;">${name}${qtyPart}</td>
        <td style="padding:3px 0;font-size:12px;text-align:right;color:#000;">$${fmtMoney(item.priceAtTime)}</td>
      </tr>`;
    })
    .join("");

  let totalsHtml = "";
  if (showTotals) {
    const fullSubtotal = visit.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
    const discAmt = (fullSubtotal * visit.discount) / 100;
    totalsHtml = `
      ${SEP}
      <table style="width:100%;font-size:12px;">
        <tr>
          <td style="padding:2px 0;color:#000;">Subtotal</td>
          <td style="padding:2px 0;text-align:right;color:#000;">$${fmtMoney(fullSubtotal)}</td>
        </tr>
        ${visit.discount > 0 ? `
        <tr>
          <td style="padding:2px 0;color:#000;">Discount (${visit.discount}%)</td>
          <td style="padding:2px 0;text-align:right;color:#000;">-$${fmtMoney(discAmt)}</td>
        </tr>` : ""}
        <tr>
          <td style="padding:4px 0;font-weight:bold;font-size:14px;color:#000;">TOTAL</td>
          <td style="padding:4px 0;text-align:right;font-weight:bold;font-size:14px;color:#000;">$${fmtMoney(visit.total)}</td>
        </tr>
      </table>
      ${SEP}
      <div style="font-size:12px;margin:4px 0;color:#000;">
        <strong>Payment:</strong> ${
          visit.paymentMethod === "CASH"
            ? "Cash"
            : visit.paymentMethod === "CARD"
            ? "Card"
            : "Mixed"
        }
        ${
          visit.paymentMethod === "MIXED"
            ? `<div style="padding-left:8px;color:#000;">
                Cash: $${fmtMoney(visit.cashAmount ?? 0)}<br/>
                Card: $${fmtMoney(visit.cardAmount ?? 0)}
              </div>`
            : ""
        }
      </div>`;
  } else {
    totalsHtml = `
      ${SEP}
      <table style="width:100%;font-size:12px;">
        <tr>
          <td style="padding:4px 0;font-weight:bold;color:#000;">TOTAL</td>
          <td style="padding:4px 0;text-align:right;font-weight:bold;color:#000;">$${fmtMoney(displayTotal)}</td>
        </tr>
      </table>`;
  }

  const footerHtml = shop.receiptFooter
    ? `${SEP}<div style="text-align:center;font-size:12px;color:#000;font-style:italic;">${shop.receiptFooter}</div>`
    : "";

  const notesHtml =
    showTotals && visit.notes
      ? `<div style="font-size:11px;color:#000;margin:4px 0;">Note: ${visit.notes}</div>`
      : "";

  return `
    <div style="font-family:monospace,sans-serif;width:300px;padding:16px;background:#fff;color:#000;">
      <div style="text-align:center;margin-bottom:8px;">
        ${logoHtml}
        <div style="font-weight:bold;font-size:16px;color:#000;">${shop.shopName}</div>
        ${contactHtml}
      </div>
      ${SEP}
      <div style="font-size:11px;color:#000;margin:4px 0;">Receipt #: ${receiptNo}</div>
      <div style="font-size:11px;color:#000;margin:4px 0;">Date: ${fmtDate(visit.visitAt)}</div>
      <div style="font-size:11px;color:#000;margin:4px 0;">Barber: ${visit.barber.name}</div>
      <div style="font-size:11px;color:#000;margin:4px 0;">Customer: ${visit.customer.name}${visit.customer.phone ? `<br/>&nbsp;&nbsp;${visit.customer.phone}` : ""}</div>
      ${SEP}
      <table style="width:100%;">
        ${itemRows}
      </table>
      ${totalsHtml}
      ${notesHtml}
      ${footerHtml}
    </div>`;
}

export function buildWhatsAppText(
  visit: ReceiptVisit,
  shop: ReceiptShopSettings
): string {
  const receiptNo = visit.id.slice(-8).toUpperCase();
  const date = fmtDate(visit.visitAt);
  const subtotal = visit.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
  const discAmt = (subtotal * visit.discount) / 100;

  const serviceLines = visit.items
    .map((i) => {
      const qty = i.quantity > 1 ? ` ×${i.quantity}` : "";
      return `  • ${i.service.name}${qty} — $${fmtMoney(i.priceAtTime * i.quantity)}`;
    })
    .join("\n");

  const payStr =
    visit.paymentMethod === "CASH" ? "Cash"
    : visit.paymentMethod === "CARD" ? "Card"
    : "Mixed";

  const parts: string[] = [
    `*${shop.shopName}*`,
    `📋 Receipt #${receiptNo}`,
    `📅 ${date}`,
    `👤 Barber: ${visit.barber.name}`,
    ``,
    `*Services:*`,
    serviceLines,
    ``,
  ];

  if (visit.discount > 0) {
    parts.push(`Subtotal: $${fmtMoney(subtotal)}`);
    parts.push(`Discount (${visit.discount}%): -$${fmtMoney(discAmt)}`);
  }
  parts.push(`*Total: $${fmtMoney(visit.total)}*`);
  parts.push(`Payment: ${payStr}`);

  if (shop.receiptFooter) {
    parts.push(``);
    parts.push(shop.receiptFooter);
  }

  return parts.join("\n");
}

export async function downloadReceiptPdf(
  visit: ReceiptVisit,
  shop: ReceiptShopSettings
): Promise<void> {
  const { jsPDF } = await import("jspdf");

  // A4 is universally supported — custom page sizes cause clipping in many PDF viewers
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth(); // 595.28 pt
  const margin = 60;
  const contentW = pageW - margin * 2;            // ~475 pt
  const col2 = pageW - margin;                    // right-align anchor
  const lh = 18;
  let y = 30;

  const sep = () => {
    doc.setLineDashPattern([2, 2], 0);
    doc.setDrawColor(0);
    doc.line(margin, y, pageW - margin, y);
    doc.setLineDashPattern([], 0);
    y += lh;
  };

  // Logo
  if (shop.shopLogo) {
    const match = shop.shopLogo.match(/^data:image\/(\w+);base64,/);
    if (match) {
      const fmt = match[1].toUpperCase() === "JPG" ? "JPEG" : match[1].toUpperCase();
      const logoW = 200;
      const logoH = 160;
      const logoX = (pageW - logoW) / 2;
      try {
        doc.addImage(shop.shopLogo, fmt, logoX, y, logoW, logoH);
        y += logoH + 10;
      } catch {
        // logo failed to render — skip it
      }
    }
  }

  // Shop name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(shop.shopName, pageW / 2, y, { align: "center" });
  y += lh + 4;

  // Contact — split using same doc instance so font metrics are accurate
  if (shop.shopPhone || shop.shopAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const contact = [shop.shopPhone, shop.shopAddress].filter(Boolean).join("  |  ");
    const contactLines: string[] = doc.splitTextToSize(contact, contentW);
    for (const line of contactLines) {
      doc.text(line, pageW / 2, y, { align: "center" });
      y += lh;
    }
  }

  sep();

  const receiptNo = visit.id.slice(-8).toUpperCase();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Receipt #: ${receiptNo}`, margin, y); y += lh;
  doc.text(`Date: ${fmtDate(visit.visitAt)}`, margin, y); y += lh;
  doc.text(`Barber: ${visit.barber.name}`, margin, y); y += lh;
  doc.text(`Customer: ${visit.customer.name}`, margin, y); y += lh;

  sep();

  // Items
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  for (const item of visit.items) {
    const name = item.service.name + (item.quantity > 1 ? ` ×${item.quantity}` : "");
    const nameLines: string[] = doc.splitTextToSize(name, contentW - 90);
    doc.text(nameLines[0], margin, y);
    doc.text(`$${fmtMoney(item.priceAtTime * item.quantity)}`, col2, y, { align: "right" });
    y += lh;
    for (let i = 1; i < nameLines.length; i++) {
      doc.text(nameLines[i], margin + 10, y);
      y += lh;
    }
  }

  sep();

  const subtotal = visit.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
  doc.setFontSize(11);
  if (visit.discount > 0) {
    const discAmt = (subtotal * visit.discount) / 100;
    doc.text("Subtotal", margin, y);
    doc.text(`$${fmtMoney(subtotal)}`, col2, y, { align: "right" });
    y += lh;
    doc.text(`Discount (${visit.discount}%)`, margin, y);
    doc.text(`-$${fmtMoney(discAmt)}`, col2, y, { align: "right" });
    y += lh;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("TOTAL", margin, y);
  doc.text(`$${fmtMoney(visit.total)}`, col2, y, { align: "right" });
  y += lh;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const payStr =
    visit.paymentMethod === "CASH" ? "Cash"
    : visit.paymentMethod === "CARD" ? "Card"
    : "Mixed";
  doc.text(`Payment: ${payStr}`, margin, y);
  y += lh;

  if (shop.receiptFooter) {
    sep();
    doc.setFontSize(10);
    const footerLines: string[] = doc.splitTextToSize(shop.receiptFooter, contentW);
    for (const line of footerLines) {
      doc.text(line, pageW / 2, y, { align: "center" });
      y += lh;
    }
  }

  doc.save(`receipt-${receiptNo}.pdf`);
}

export function printReceipt(
  visit: ReceiptVisit,
  shop: ReceiptShopSettings,
  mode: "full" | "per-service"
): void {
  let bodyContent: string;

  if (mode === "full") {
    bodyContent = buildReceiptBlock(visit, shop, visit.items, true);
  } else {
    bodyContent = visit.items
      .map((item, idx) => {
        const block = buildReceiptBlock(visit, shop, [item], false);
        const isLast = idx === visit.items.length - 1;
        return isLast
          ? block
          : `<div style="page-break-after:always;">${block}</div>`;
      })
      .join("");
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt</title>
  <style>
    * { color: #000 !important; }
    body { margin: 0; background: #fff; display: flex; flex-direction: column; align-items: center; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  ${bodyContent}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  <\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=420,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
