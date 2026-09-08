import { requireOwnerPage } from "@/lib/guards";

export default async function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwnerPage();
  return <>{children}</>;
}
