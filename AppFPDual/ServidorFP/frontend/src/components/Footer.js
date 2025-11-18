import React from 'react';
import '../styles.css'; // Importa el archivo de estilos CSS global

function Footer() {
  return (
    <footer className="school-footer">
      <div className="footer-content">
        <div className="footer-section">
          <h3>Contacto</h3>
          <p>Dirección: C/Maria Auxiliadora, 13</p>
          <p>Teléfono: 123-456-789</p>
          <p>Email: info@colegio.com</p>
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
          <ul className="social-links">
            <li><a href="/"><i className="fab fa-facebook"></i>FACEBOOK</a></li>
            <li><a href="/"><i className="fab fa-twitter"></i>TWITTER</a></li>
            <li><a href="/"><i className="fab fa-instagram"></i>INSTAGRAM</a></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; 2024 Colegio Salesianos Zaragoza. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}

export default Footer;