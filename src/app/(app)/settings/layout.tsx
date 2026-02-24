import { requireOwnerPage } from "@/lib/guards";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage();
  return <>{children}</>;
}
