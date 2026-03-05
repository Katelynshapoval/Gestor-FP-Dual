import Header from './Header';
import Footer from './Footer';

// LAYOUT GENERAL de la aplicación.
// Envuelve cualquier página con el header y el footer para
// no repetir esa estructura en cada ruta de App.js.
const PageLayout = ({ children }) => (
  <>
    <Header />
    {children}
    <Footer />
  </>
);

export default PageLayout;
