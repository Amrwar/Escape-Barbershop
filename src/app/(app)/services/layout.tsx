import { requireOwnerPage } from "@/lib/guards";

export default async function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwnerPage();
  return <>{children}</>;
}
