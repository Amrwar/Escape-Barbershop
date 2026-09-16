import type { Metadata } from "next";
import { CustomerShell } from "@/components/customer/CustomerShell";

export const metadata: Metadata = {
  title: "Escape Barbershop",
  description: "Book your next appointment at Escape Barbershop",
};

/** The customer app: its own chrome, nothing of the shop's back office. */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
