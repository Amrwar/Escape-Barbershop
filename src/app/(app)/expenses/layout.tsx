import { requireOwnerPage } from "@/lib/guards";

export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage();
  return <>{children}</>;
}
