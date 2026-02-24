import { requireAuthPage } from "@/lib/guards";

export default async function CashDrawerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuthPage();
  return <>{children}</>;
}
