import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { landingFor } from "@/lib/nav";

export default async function Home() {
  const session = await getSession();
  // The owner lands in the admin console, the cashier at the till.
  redirect(session ? landingFor(session.user.role) : "/login");
}
