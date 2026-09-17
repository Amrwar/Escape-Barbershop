/**
 * Selling a product over the counter.
 *
 * The shop has always bought stock and used it on the floor; what it could not
 * do is *sell* a bottle of beard oil and have that show up anywhere. So a visit
 * can now carry product lines beside its service lines, and the difference
 * between the two is deliberate:
 *
 *  - a **service** line feeds the barber's commission and the length of an
 *    appointment;
 *  - a **product** line feeds neither. It is stock leaving the shelf and money
 *    arriving in the drawer, and nothing else.
 *
 * Both land on the visit total, which is what the drawer, the day journal and
 * every report already read — so a product sale needs no new money path, and
 * cannot disagree with one.
 */

export interface SellableProduct {
  id: string;
  name: string;
  isActive: boolean;
  salePrice: number;
  costPrice: number;
}

export interface ProductLine {
  productId: string;
  quantity: number;
  /** What was actually charged, which the cashier may change at the counter. */
  unitPrice: number;
}

export interface PricedLine extends ProductLine {
  name: string;
  unitCost: number;
  total: number;
}

/** A product is for sale when it is active and somebody has priced it. */
export function isSellable(product: Pick<SellableProduct, "isActive" | "salePrice">): boolean {
  return product.isActive && product.salePrice > 0;
}

export function lineTotal(line: ProductLine): number {
  return Math.round(line.quantity * line.unitPrice * 100) / 100;
}

export function productsTotal(lines: ProductLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + lineTotal(line), 0) * 100) / 100;
}

/**
 * Fill each line out with the name and cost as they are today, so the sale
 * still reads correctly after a price change — the same reason a service line
 * copies its price in.
 */
export function priceLines(lines: ProductLine[], products: SellableProduct[]): PricedLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));

  return lines.map((line) => {
    const product = byId.get(line.productId);
    return {
      ...line,
      name: product?.name ?? "—",
      unitCost: product?.costPrice ?? 0,
      total: lineTotal(line),
    };
  });
}

export type LineProblem =
  | { line: ProductLine; problem: "unknown" }
  | { line: ProductLine; problem: "not-for-sale"; name: string }
  | { line: ProductLine; problem: "quantity" }
  | { line: ProductLine; problem: "short"; name: string; available: number };

/**
 * Everything wrong with what the till is about to sell: something it does not
 * stock, something not for sale, a quantity that is not a quantity, or more than
 * the branch shelf holds.
 *
 * The shelf check is the point. A shop that can sell what it does not have ends
 * up with a stock figure nobody believes, and then nobody counts.
 */
export function problemsWith(
  lines: ProductLine[],
  products: SellableProduct[],
  available: Record<string, number>
): LineProblem[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const problems: LineProblem[] = [];

  // Two lines of the same product draw down the same shelf.
  const wanted: Record<string, number> = {};
  for (const line of lines) wanted[line.productId] = (wanted[line.productId] ?? 0) + line.quantity;

  const flagged = new Set<string>();
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) {
      problems.push({ line, problem: "unknown" });
      continue;
    }
    if (!isSellable(product)) {
      problems.push({ line, problem: "not-for-sale", name: product.name });
      continue;
    }
    if (!(line.quantity > 0) || !Number.isFinite(line.quantity)) {
      problems.push({ line, problem: "quantity" });
      continue;
    }

    const shelf = available[line.productId] ?? 0;
    if (wanted[line.productId] > shelf && !flagged.has(line.productId)) {
      flagged.add(line.productId);
      problems.push({ line, problem: "short", name: product.name, available: shelf });
    }
  }

  return problems;
}

/** What the shop made on a sale, over what the stock cost it. */
export function marginOf(lines: { total: number; unitCost: number; quantity: number }[]): number {
  const cost = lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
  const revenue = lines.reduce((sum, line) => sum + line.total, 0);
  return Math.round((revenue - cost) * 100) / 100;
}
