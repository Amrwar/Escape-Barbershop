import { requireOwnerPage } from "@/lib/guards";

export default async function AttendanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwnerPage();
  return <>{children}</>;
}
