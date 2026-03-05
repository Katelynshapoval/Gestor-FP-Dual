import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../../globales/User';

// CABECERA de la aplicación, sticky en la parte superior.
function Header() {
  const { user, logout } = useUser();
  const location = useLocation().pathname;
  const navigate = useNavigate();

  const NavLink = ({ to, label }) =>
    location !== to ? (
      <Link to={to} className="nav-link">{label}</Link>
    ) : null;

  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <img
          src="https://salesianosrioja.com/wp-content/uploads/2016/03/Logo-Salesianos_vertical.png"
          alt="Salesianos"
        />
        <div>
          <div className="brand-name">Gestor FP Dual</div>
          <div className="brand-sub">Salesianos Zaragoza</div>
        </div>
      </Link>

      <nav>
        {user && <span className="nav-welcome">Hola, {user.nombre}</span>}
        <NavLink to="/" label="Inicio" />
        <NavLink to="/addDualStudent" label="Alumnos" />
        <NavLink to="/addCompanyRequest" label="Empresas" />
        {user && <NavLink to="/linkStudents" label="Enlazar" />}
        {location !== '/login' && (
          <button onClick={() => logout(navigate)} className="nav-link nav-link-logout">
            {user ? 'Salir' : 'Acceder'}
          </button>
        )}
      </nav>
    </header>
  );
}

export default Header;
