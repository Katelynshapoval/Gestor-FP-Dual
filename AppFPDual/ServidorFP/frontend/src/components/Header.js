import { Link, useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../globales/User';

function Header() {
    const { user, logout } = useUser(); // Obtiene el usuario del contexto
    const location = useLocation().pathname; // Obtiene el path de la ubicación actual
    const navigate = useNavigate(); //Para enviar al logout y poder redirigir

    return (
        <div>
            <header>
                <nav className="navbar navbar-expand-lg px-3">
                    <Link to="/" className="navbar-brand d-flex align-items-center">
                        <img
                            src="https://salesianosrioja.com/wp-content/uploads/2016/03/Logo-Salesianos_vertical.png"
                            alt="Logo"
                            style={{ width: '80px', height: '50px', marginRight: '15px' }}
                        />
                        <span className="fs-4 fw-bold">GESTOR DE FP DUAL</span>
                    </Link>
                    {user && (
                        <div>
                            <span className="navbar-text fw-bold text-white">Bienvenido {user.nombre} {user.specialities}</span>
                        </div>
                    )}
                    <div className="collapse navbar-collapse justify-content-end">
                        <ul className="navbar-nav">
                            {location !== '/' && (
                            <li className="nav-item">
                                <Link to="/" className="nav-link fw-bold text-white">HOME</Link>
                            </li>
                            )}
                            {location !== '/addDualStudent' && (
                            <li className="nav-item">
                                <Link to="/addDualStudent" className="nav-link fw-bold text-white">ALUMNOS</Link>
                            </li>
                            )}
                            {location !== '/addCompanyRequest' && (
                            <li className="nav-item">
                                <Link to="/addCompanyRequest" className="nav-link fw-bold text-white">EMPRESAS</Link>
                            </li>
                            )}
                            {user && location !== '/linkStudents' && (
                            <li className="nav-item">
                                <Link to="/linkStudents" className="nav-link fw-bold text-white">ENLAZAR</Link>
                            </li>
                            )}
                            {user && location !== '/login' && (
                                <li className="nav-item">
                                    <button onClick={() => logout(navigate)} className="nav-link fw-bold" style={{ background: 'none', border: 'none' }}>
                                        LOGOUT
                                    </button>
                                </li>
                            )}
                            {!user && location !== '/login' && (
                                <li className="nav-item">
                                    <button onClick={() => logout(navigate)} className="nav-link fw-bold" style={{ background: 'none', border: 'none' }}>
                                        LOGIN
                                    </button>
                                </li>
                            )}
                        </ul>
                    </div>
                </nav>
            </header>
        </div>
    );
}

export default Header;