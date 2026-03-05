// PIE DE PÁGINA con información de contacto y redes sociales.
function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-section">
          <h3>Contacto</h3>
          <p>C/ María Auxiliadora, 13</p>
          <p>Teléfono: 123-456-789</p>
          <p>info@colegio.com</p>
        </div>
        <div className="footer-section">
          <h3>Enlaces útiles</h3>
          <ul>
            <li><a href="/">Acerca de nosotros</a></li>
            <li><a href="/">Programas académicos</a></li>
            <li><a href="/">Prácticas en empresas</a></li>
            <li><a href="/">Contacto</a></li>
          </ul>
        </div>
        <div className="footer-section">
          <h3>Síguenos</h3>
          <div className="footer-social">
            <a href="/">Facebook</a>
            <a href="/">Twitter</a>
            <a href="/">Instagram</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        © 2024 Colegio Salesianos Zaragoza. Todos los derechos reservados.
      </div>
    </footer>
  );
}

export default Footer;
