import { requireOwnerPage } from "@/lib/guards";

export default async function BarbersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwnerPage();
  return <>{children}</>;
}
