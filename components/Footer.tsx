export function Footer() {
  return (
    <footer className="border-t border-border/80 py-8">
      <div className="container-shell flex flex-col justify-between gap-3 text-sm text-zinc-400 md:flex-row">
        <div>
          <p>© {new Date().getFullYear()} Ikosagon. Built to upgrade the systems you already run.</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">
            Shawn Cooper · Applied AI Engineer &amp; QA · work-from-anywhere
          </p>
        </div>
        <p className="font-mono">
          <a href="mailto:shawn@ikosagon.com" className="hover:text-accent">
            shawn@ikosagon.com
          </a>
          {" · "}
          www.ikosagon.com
        </p>
      </div>
    </footer>
  );
}
