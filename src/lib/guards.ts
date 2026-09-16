import { redirect } from "next/navigation";
import { getSession } from "./auth";
import { isStaffRole } from "./roles";

export async function requireOwnerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role === "CUSTOMER") redirect("/app");
  if (session.user.role === "BARBER") redirect("/barber");
  if (session.user.role !== "OWNER") redirect("/dashboard");
  return session;
}

export async function requireOwnerOrCashierPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role === "CUSTOMER") redirect("/app");
  if (session.user.role === "BARBER") redirect("/barber");
  if (session.user.role !== "OWNER" && session.user.role !== "CASHIER") redirect("/dashboard");
  return session;
}

/** Any member of staff. A customer login is sent to the customer app. */
export async function requireAuthPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role === "BARBER") redirect("/barber");
  if (!isStaffRole(session.user.role)) redirect("/app");
  return session;
}

/** A barber on their own screens. Anyone else is sent to their own side. */
export async function requireBarberPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "BARBER") redirect("/");
  return session;
}

/** A signed-in customer. Staff are sent back to their own side. */
export async function requireCustomerPage() {
  const session = await getSession();
  if (!session) redirect("/app/login");
  if (session.user.role !== "CUSTOMER") redirect("/");
  return session;
}
