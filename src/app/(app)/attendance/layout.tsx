import { requireOwnerOrCashierPage } from "@/lib/guards";

export default async function AttendanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwnerOrCashierPage();
  return <>{children}</>;
}
