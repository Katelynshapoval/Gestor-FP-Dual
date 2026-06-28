function Footer() {
  return (
    <footer className="border-t border-surface-200 bg-white/70 px-4 py-4 text-xs text-muted sm:px-6 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="font-semibold text-charcoal-800">
            Salesianos Zaragoza
          </span>
          <span className="text-muted"> · Gestor FP Dual</span>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-muted">C/ María Auxiliadora, 13</span>

          <a
            className="text-muted transition-colors duration-150 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/70"
            href="/"
          >
            Contacto
          </a>

          <span className="text-muted">© 2026</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
