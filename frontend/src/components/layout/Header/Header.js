import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from '../../../context/UserContext';
import { useState } from "react";
import { IoMdMenu } from "react-icons/io";
import { IoMdClose } from "react-icons/io";
import "./Header.css";

function Header() {
  const { user, logout } = useUser();
  const location = useLocation().pathname;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Suppresses the link if already on that route to avoid no-op navigation
  const NavLink = ({ to, label }) =>
    location !== to ? (
      <Link to={to} onClick={() => setOpen(false)} className="nav-link">
        {label}
      </Link>
    ) : null;

  return (
    <>
      <header className="sticky top-0 z-50 bg-surface-50 shadow-md">
        <div className="flex items-center justify-between px-6 py-5">
          {/* Brand logo and name */}
          <Link to="/" className="flex items-center gap-3">
            <img src="logo.png" alt="Salesianos" className="w-7 h-7" />
            <div>
              <div className="font-display text-lg font-bold">Gestor FP Dual</div>
              <div className="text-[0.65rem] uppercase tracking-widest opacity-70">Salesianos Zaragoza</div>
            </div>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-3">
            {user && (
              <span className="nav-welcome">
                Hola, <span>{user.nombre}</span>
              </span>
            )}

            <NavLink to="/" label="Inicio" />
            {(!user || user.rol === "ADMINISTRADOR" || user.rol === "COORDINADOR") && (
              <>
                <NavLink to="/addDualStudent" label="Alumnos" />
                <NavLink to="/addCompanyRequest" label="Empresas" />
              </>
            )}

            {user?.rol === "EMPRESA" && (
              <NavLink to="/companyMain" label="Mi empresa" />
            )}

            {(user?.rol === "ADMINISTRADOR" || user?.rol === "COORDINADOR") && (
              <NavLink to="/convocatorias" label="Convocatorias" />
            )}

            {user && <NavLink to="/linkStudents" label="Enlazar" />}

            {location !== "/login" && (
              <button
                onClick={() => logout(navigate)}
                className="nav-link nav-link-logout"
              >
                {user ? "Salir" : "Login"}
              </button>
            )}
          </nav>

          {/* Mobile menu toggle */}
          <button onClick={() => setOpen(true)} className="md:hidden text-2xl">
            <IoMdMenu />
          </button>
        </div>
      </header>

      {/* Backdrop overlay for the mobile drawer */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition ${
          open ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Mobile slide-in drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[200px] bg-white shadow-xl z-50 transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 flex flex-col gap-4">
          <button onClick={() => setOpen(false)} className="self-end text-xl">
            <IoMdClose />
          </button>

          {user && (
            <span className="nav-welcome w-fit">
              Hola, <span>{user.nombre}</span>
            </span>
          )}

          <NavLink to="/" label="Inicio" />
          {(!user || user.rol === "ADMINISTRADOR" || user.rol === "COORDINADOR") && (
            <>
              <NavLink to="/addDualStudent" label="Alumnos" />
              <NavLink to="/addCompanyRequest" label="Empresas" />
            </>
          )}
          {user?.rol === "EMPRESA" && <NavLink to="/companyMain" label="Mi empresa" />}
          {user && <NavLink to="/linkStudents" label="Enlazar" />}

          {location !== "/login" && (
            <button
              onClick={() => { logout(navigate); setOpen(false); }}
              className="nav-link nav-link-logout w-fit"
            >
              {user ? "Salir" : "Acceder"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default Header;
