import { prisma } from "./prisma";

export type StockLocationValue = "MAIN" | "BRANCH";

export const STOCK_LOCATIONS: StockLocationValue[] = ["MAIN", "BRANCH"];

export function isStockLocation(v: unknown): v is StockLocationValue {
  return v === "MAIN" || v === "BRANCH";
}

export interface ProductBalance {
  productId: string;
  main: number;
  branch: number;
  total: number;
}

/**
 * Balances are always derived from the StockMovement ledger, never stored on the
 * product — that way a deleted invoice, transfer or stocktake can never leave a
 * stale quantity behind.
 */
export async function getBalances(productIds?: string[]): Promise<Map<string, ProductBalance>> {
  const rows = await prisma.stockMovement
    .groupBy({
      by: ["productId", "location"],
      where: productIds?.length ? { productId: { in: productIds } } : undefined,
      _sum: { quantity: true },
    })
    .catch(() => [] as { productId: string; location: string; _sum: { quantity: number | null } }[]);

  const map = new Map<string, ProductBalance>();
  for (const r of rows) {
    const entry = map.get(r.productId) ?? { productId: r.productId, main: 0, branch: 0, total: 0 };
    const qty = r._sum.quantity ?? 0;
    if (r.location === "MAIN") entry.main += qty;
    else entry.branch += qty;
    entry.total = entry.main + entry.branch;
    map.set(r.productId, entry);
  }
  return map;
}

export async function getBalance(productId: string, location: StockLocationValue): Promise<number> {
  const res = await prisma.stockMovement.aggregate({
    where: { productId, location },
    _sum: { quantity: true },
  });
  return res._sum.quantity ?? 0;
}
