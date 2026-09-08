import { requireOwnerPage } from "@/lib/guards";

export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwnerPage();
  return <>{children}</>;
}
