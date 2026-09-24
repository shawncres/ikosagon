export function Footer() {
  return (
    <footer className="border-t border-border/80 py-8">
      <div className="container-shell flex flex-col justify-between gap-3 text-sm text-zinc-400 md:flex-row">
        <p>© {new Date().getFullYear()} Ikosagon. Built for ambitious software ideas.</p>
        <p className="font-mono">www.ikosagon.com</p>
      </div>
    </footer>
  );
}
