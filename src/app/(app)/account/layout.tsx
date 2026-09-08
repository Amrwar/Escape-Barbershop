import { requireAuthPage } from "@/lib/guards";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAuthPage();
  return <>{children}</>;
}
