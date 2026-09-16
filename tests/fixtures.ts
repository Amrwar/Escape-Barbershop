import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { testPrisma } from "./db";
import { shopTime } from "../src/lib/booking";

/**
 * A small shop to test against: open 11:00–23:00 every day, two barbers, three
 * services, one customer. Small enough to reason about, real enough to catch
 * what a mock would not.
 */

export const TZ = "Africa/Cairo";

/** A date far enough ahead that the notice period never gets in the way. */
export function dayAhead(days = 2): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** A moment on that day, given as shop-local minutes from midnight. */
export function at(dateISO: string, minutes: number): Date {
  return new Date(shopTime(dateISO, minutes, TZ));
}

/** Shop-local "HH:MM", which is how a person reads a slot. */
export function clock(value: Date | string | number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(value)
  );
}

export interface Shop {
  owner: { id: string; email: string };
  cashier: { id: string };
  barbers: { abdullah: string; khaled: string };
  services: { haircut: string; beard: string; protein: string };
  customer: { id: string };
}

export async function seedShop(): Promise<Shop> {
  const db = testPrisma();
  const password = await bcrypt.hash("test-password", 4);

  await db.shopHours.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 11 * 60, endMinute: 23 * 60, isOpen: true })),
  });

  const [abdullah, khaled] = await Promise.all([
    db.barber.create({ data: { name: "Abdullah", isActive: true, bookableOnline: true } }),
    db.barber.create({ data: { name: "Khaled", isActive: true, bookableOnline: true } }),
  ]);

  const [haircut, beard, protein] = await Promise.all([
    db.service.create({ data: { name: "Hair cut", defaultPrice: 150, durationMinutes: 30, bookableOnline: true } }),
    db.service.create({ data: { name: "Beard cut", defaultPrice: 80, durationMinutes: 20, bookableOnline: true } }),
    // Long, and not something a customer may book themselves.
    db.service.create({ data: { name: "Hair protein", defaultPrice: 2000, durationMinutes: 120, bookableOnline: false } }),
  ]);

  const [owner, cashier, customer] = await Promise.all([
    db.user.create({ data: { email: "owner@escape.test", password, name: "Owner", role: "OWNER" } }),
    db.user.create({ data: { email: "cashier@escape.test", password, name: "Cashier", role: "CASHIER" } }),
    db.customer.create({ data: { name: "Ahmed Mohamed", phone: "01099998888" } }),
  ]);

  return {
    owner: { id: owner.id, email: owner.email! },
    cashier: { id: cashier.id },
    barbers: { abdullah: abdullah.id, khaled: khaled.id },
    services: { haircut: haircut.id, beard: beard.id, protein: protein.id },
    customer: { id: customer.id },
  };
}

/** A customer login attached to an existing customer record. */
export async function seedCustomerLogin(customerId: string, phone = "01099998888") {
  const db = testPrisma();
  const user = await db.user.create({
    data: {
      name: "Ahmed Mohamed",
      phone,
      password: await bcrypt.hash("customer-password", 4),
      role: "CUSTOMER",
      customerId,
    },
  });
  return { id: user.id, customerId };
}

/** The session shape the route handlers read. */
export function staffSession(userId: string, role: "OWNER" | "CASHIER" = "OWNER") {
  return { user: { id: userId, email: "owner@escape.test", name: "Owner", role }, loginAt: Date.now(), expires: "" };
}

export function customerSession(userId: string, customerId: string) {
  return {
    user: { id: userId, email: "", name: "Ahmed Mohamed", role: "CUSTOMER", customerId },
    loginAt: Date.now(),
    expires: "",
  };
}

/** A request shaped the way a route handler receives it. */
export function jsonRequest(url: string, body?: unknown, method = "POST") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function getRequest(url: string) {
  return new NextRequest(`http://localhost${url}`);
}
