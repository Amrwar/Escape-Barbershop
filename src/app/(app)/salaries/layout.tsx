import { requireOwnerPage } from "@/lib/guards";

export default async function SalariesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwnerPage();
  return <>{children}</>;
}
