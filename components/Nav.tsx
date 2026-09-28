"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/75 backdrop-blur-md">
      <nav className="container-shell flex h-16 items-center justify-between gap-4">
        <div className="min-w-0">
          <Link href="/" className="font-[var(--font-space-grotesk)] text-2xl font-bold">
            IKOSAGON
          </Link>
          <p className="truncate font-mono text-[11px] leading-tight text-zinc-400 sm:text-xs">
            Shawn Cooper · Applied AI Engineer &amp; QA
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm sm:gap-5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "transition-colors hover:text-accent",
                pathname === item.href ? "text-accent" : "text-zinc-300",
              )}
            >
              {item.label}
            </Link>
          ))}
          <a
            href="mailto:shawn@ikosagon.com"
            className="hidden text-zinc-400 transition-colors hover:text-accent md:inline"
          >
            shawn@ikosagon.com
          </a>
        </div>
      </nav>
    </header>
  );
}
