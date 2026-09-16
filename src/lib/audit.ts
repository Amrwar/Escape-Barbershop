import { prisma } from "./prisma";

/**
 * The activity trail. Anything that removes or rewrites money or a record gets
 * an entry, so the owner can see what a cashier changed after the fact.
 *
 * Writing the trail must never break the operation being recorded: every call
 * is fire-and-forget and swallows its own errors. A missing log line is bad, a
 * failed drawer close because logging failed is worse.
 */

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export type AuditEntity =
  | "VISIT"
  | "APPOINTMENT"
  | "EXPENSE"
  | "ADVANCE"
  | "PENALTY"
  | "CASH_MOVEMENT"
  | "DRAWER_SESSION"
  | "PURCHASE"
  | "SUPPLIER_PAYMENT"
  | "STOCK_TRANSFER"
  | "STOCK_COUNT"
  | "PRODUCT"
  | "PRODUCT_USAGE"
  | "SUPPLIER"
  | "SERVICE"
  | "CUSTOMER"
  | "BARBER"
  | "ATTENDANCE"
  | "OFFER"
  | "SETTING"
  | "USER";

interface Actor {
  user: { id: string; name?: string | null; email?: string | null; role: string };
}

export interface AuditInput {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  summary: string;
  amount?: number | null;
  /** The state before the change, so a deleted row can still be read back. */
  details?: unknown;
}

export async function recordAudit(actor: Actor, input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actor.user.id,
        userName: actor.user.name || actor.user.email || "—",
        userRole: actor.user.role,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary.slice(0, 500),
        amount: input.amount ?? null,
        details: input.details === undefined ? null : JSON.stringify(input.details).slice(0, 4000),
      },
    });
  } catch (err) {
    console.error("[audit]", input.entity, input.action, err);
  }
}

/** A one-line description of a visit, readable months later. */
export function describeVisit(visit: {
  total: number;
  paymentMethod: string;
  visitAt: Date;
  sessionSequence?: number | null;
  customer?: { name: string } | null;
  barber?: { name: string } | null;
  items?: { quantity: number; service?: { name: string } | null }[];
}): string {
  const services = (visit.items ?? [])
    .map((i) => `${i.service?.name ?? "?"}${i.quantity > 1 ? ` x${i.quantity}` : ""}`)
    .join(", ");
  return [
    visit.sessionSequence ? `#${visit.sessionSequence}` : null,
    visit.customer?.name ?? "Walk-in",
    visit.barber?.name ? `/ ${visit.barber.name}` : null,
    services || null,
    `${visit.total.toFixed(2)} ${visit.paymentMethod}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
