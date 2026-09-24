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
      <nav className="container-shell flex h-16 items-center justify-between">
        <Link href="/" className="font-[var(--font-space-grotesk)] text-2xl font-bold">
          IKOSAGON
        </Link>
        <div className="flex items-center gap-5 text-sm">
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
        </div>
      </nav>
    </header>
  );
}
