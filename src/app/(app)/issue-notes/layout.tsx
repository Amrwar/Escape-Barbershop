import { requireOwnerOrCashierPage } from "@/lib/guards";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireOwnerOrCashierPage();
  return <>{children}</>;
}
