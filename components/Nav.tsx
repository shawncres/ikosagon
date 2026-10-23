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
      {/* Phones: two compact rows (logo + subtitle, then links). sm and up: the original single row. */}
      <nav className="container-shell flex flex-col gap-1.5 py-2.5 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
        <div className="flex min-w-0 items-baseline gap-2.5 sm:block">
          <Link href="/" className="font-[var(--font-space-grotesk)] text-xl font-bold sm:text-2xl">
            IKOSAGON
          </Link>
          <p className="whitespace-nowrap font-mono text-[11px] leading-tight text-zinc-200 sm:text-sm">
            Software &amp; AI studio
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm sm:shrink-0">
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
