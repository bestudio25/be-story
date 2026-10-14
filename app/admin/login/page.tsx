import { adminCount } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const sp = await searchParams;
  const needsSetup = (await adminCount()) === 0;
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#0f0d0b] p-6">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(255,226,180,.12),transparent_70%)]" />
      <LoginForm setupToken={needsSetup ? sp.setup ?? "" : sp.setup ? sp.setup : null} reset={!needsSetup} />
    </main>
  );
}
