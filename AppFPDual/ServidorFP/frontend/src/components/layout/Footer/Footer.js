import "./Footer.css";
function Footer() {
  return (
    <footer className="bg-brand-500 text-white mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h3 className="footer-title">Contacto</h3>
          <p className="footer-text">C/ María Auxiliadora, 13</p>
          <p className="footer-text">Tel: 123-456-789</p>
          <p className="footer-text">info@colegio.com</p>
        </div>

        <div>
          <h3 className="footer-title">Enlaces útiles</h3>
          <ul className="space-y-1 footer-text">
            <li>
              <a className="footer-link" href="/">
                Acerca de nosotros
              </a>
            </li>
            <li>
              <a className="footer-link" href="/">
                Programas académicos
              </a>
            </li>
            <li>
              <a className="footer-link" href="/">
                Prácticas en empresas
              </a>
            </li>
            <li>
              <a className="footer-link" href="/">
                Contacto
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="footer-title">Síguenos</h3>

          <div className="flex gap-2 flex-wrap">
            <a className="footer-social-pill">Facebook</a>
            <a className="footer-social-pill">Twitter</a>
            <a className="footer-social-pill">Instagram</a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/20 text-center text-xs py-4 opacity-80">
        © 2026 Salesianos Zaragoza · Gestor FP Dual
      </div>
    </footer>
  );
}

export default Footer;
