import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import Shell from "@/components/admin/Shell";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  return <Shell email={a.email}>{children}</Shell>;
}
