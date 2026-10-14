"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "./api";

export default function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const nav = [
    { href: "/admin", label: "Eventos" },
    { href: "/admin/armazenamento", label: "Armazenamento" },
  ];
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0b0b]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2.5">
            <img src="/brand/be-logo-cream.png" alt="" className="w-7" />
            <span className="text-xs uppercase tracking-[.26em]">BE Story</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={`rounded-full px-3 py-1.5 transition ${path === n.href ? "bg-white/10 text-cream" : "text-white/60 hover:text-cream"}`}>{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-white/50">
            <a href="/demo" target="_blank" className="hidden hover:text-cream sm:inline">Demonstração</a>
            <span className="hidden md:inline">{email}</span>
            <button className="rounded-full border border-white/10 px-3 py-1.5 hover:text-cream" onClick={async () => { await api("/api/admin/logout", { body: {} }); location.href = "/admin/login"; }}>Sair</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
