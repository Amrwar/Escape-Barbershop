import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Bits shared by the appointment routes. They live here because a Next route
 * file may only export route handlers.
 */

export const appointmentInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  barber: { select: { id: true, name: true } },
  services: { select: { id: true, serviceId: true, serviceName: true, price: true, durationMinutes: true } },
} satisfies Prisma.AppointmentInclude;

/** A refusal worth reading — "that time has just been taken", not "invalid data". */
export class BookingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function bookingErrorResponse(err: unknown) {
  if (err instanceof BookingError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Error && err.message.includes("Unauthorized")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Two people taking the last slot at once: the loser is asked to pick again.
  if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2034" || err.code === "P2002")) {
    return NextResponse.json({ error: "That time has just been taken" }, { status: 409 });
  }
  console.error("[appointments]", err);
  return NextResponse.json({ error: "Invalid data" }, { status: 400 });
}
