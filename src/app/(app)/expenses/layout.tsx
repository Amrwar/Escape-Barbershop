import { requireOwnerOrCashierPage } from "@/lib/guards";

export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerOrCashierPage();
  return <>{children}</>;
}
