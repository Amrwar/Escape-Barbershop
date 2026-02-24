import { redirect } from "next/navigation";
import { getSession } from "./auth";

export async function requireOwnerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/dashboard");
  return session;
}

export async function requireAuthPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
