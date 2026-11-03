"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./AppContext";

export function Screen({ title, back, children }: { title?: string; back?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-28 pt-5">
      {(title || back) && (
        <header className="mb-4 flex items-center gap-3">
          {back && (
            <Link href={back} className="rounded-full px-2 py-1 text-xl text-ink-soft" aria-label="Back">
              ←
            </Link>
          )}
          {title && <h1 className="text-2xl font-bold">{title}</h1>}
        </header>
      )}
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 ${className}`}>{children}</div>;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" };
export function Button({ variant = "primary", className = "", ...rest }: BtnProps) {
  const styles = {
    primary: "bg-brand text-white active:bg-brand-dark disabled:bg-[#f7b4a3]",
    soft: "bg-brand-soft text-brand-dark active:opacity-80 disabled:opacity-50",
    ghost: "text-ink-soft active:bg-black/5",
  }[variant];
  return (
    <button
      {...rest}
      className={`rounded-xl px-4 py-3 text-base font-semibold transition ${styles} ${className}`}
    />
  );
}

// Text that may be Arabic or English: the browser picks the direction per line.
export function T({ children, className = "", as: As = "span" }: {
  children: React.ReactNode; className?: string; as?: "span" | "p" | "div" | "h2" | "h3";
}) {
  return <As dir="auto" className={className}>{children}</As>;
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
}

export function Spinner() {
  return <div className="py-10 text-center text-ink-soft">Loading…</div>;
}

const NAV = [
  { href: "/home", label: "Home", icon: "⌂" },
  { href: "/create", label: "Create", icon: "＋" },
  { href: "/cards", label: "Cards", icon: "▤" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-black/5 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md justify-around">
        {NAV.map((n) => {
          const active = path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href}
              className={`flex flex-1 flex-col items-center py-2 text-xs ${active ? "text-brand-dark font-semibold" : "text-ink-soft"}`}>
              <span className="text-xl leading-6">{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Use on every signed-in screen: sends people to set-up until they have a partner.
export function useRequirePair() {
  const app = useApp();
  const router = useRouter();
  useEffect(() => {
    if (app.loading) return;
    if (!app.user) router.replace("/login");
    else if (!app.pair || !app.pair.user_b) router.replace("/onboarding");
  }, [app.loading, app.user, app.pair, router]);
  const ready = !app.loading && !!app.user && !!app.pair?.user_b && !!app.me && !!app.partner;
  return { ...app, ready };
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
