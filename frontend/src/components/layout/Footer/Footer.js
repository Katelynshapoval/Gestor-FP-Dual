import "./Footer.css";

function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div>
          <span className="footer-title">Salesianos Zaragoza</span>
          <span className="footer-text"> · Gestor FP Dual</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="footer-text">C/ María Auxiliadora, 13</span>
          <a className="footer-link" href="/">
            Contacto
          </a>
          <span className="footer-text">© 2026</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
