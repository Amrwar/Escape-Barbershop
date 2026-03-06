import { requireAuthPage } from "@/lib/guards";

export default async function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuthPage();
  return <>{children}</>;
}
