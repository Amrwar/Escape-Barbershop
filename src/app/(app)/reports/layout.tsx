import { requireAuthPage } from "@/lib/guards";

export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuthPage();
  return <>{children}</>;
}
