import type { Metadata } from "next";
import { BarberShell } from "@/components/barber/BarberShell";

export const metadata: Metadata = {
  title: "Escape — my day",
  description: "Your schedule, your customers, your earnings",
};

/** A barber's own screens: their phone, not the counter. */
export default function BarberLayout({ children }: { children: React.ReactNode }) {
  return <BarberShell>{children}</BarberShell>;
}
