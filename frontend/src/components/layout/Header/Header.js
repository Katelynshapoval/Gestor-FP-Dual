import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../../../globales/User";
import { useState } from "react";
import { IoMdMenu } from "react-icons/io";
import { IoMdClose } from "react-icons/io";
import "./Header.css";

function Header() {
  const { user, logout } = useUser();
  const location = useLocation().pathname;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const NavLink = ({ to, label }) =>
    location !== to ? (
      <Link to={to} onClick={() => setOpen(false)} className="nav-link">
        {label}
      </Link>
    ) : null;

  return (
    <>
      {/* CABECERA PRINCIPAL */}
      <header className="sticky top-0 z-50 bg-surface-50 shadow-md ">
        <div className="flex items-center justify-between px-6 py-5">
          {/* MARCA */}
          <Link to="/" className="flex items-center gap-3">
            <img src="logo.png" alt="Salesianos" className="w-7 h-7" />
            <div>
              <div className="font-display text-lg font-bold">
                Gestor FP Dual
              </div>
              <div className="text-[0.65rem] uppercase tracking-widest opacity-70">
                Salesianos Zaragoza
              </div>
            </div>
          </Link>
          {/* NAVEGACIÓN ESCRITORIO */}
          <nav className="hidden md:flex items-center gap-3">
            {user && (
              <span className="nav-welcome">
                Hola, <span>{user.nombre}</span>
              </span>
            )}

            <NavLink to="/" label="Inicio" />
            {user?.user_type == "admin" || !user ? (
              <>
                <NavLink to="/addDualStudent" label="Alumnos" />
                <NavLink to="/addCompanyRequest" label="Empresas" />
              </>
            ) : null}

            {user?.user_type === "empresa" && (
              <NavLink to="/companyMain" label="Mi empresa" />
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
          {/* BOTÓN MENÚ MÓVIL */}
          <button onClick={() => setOpen(true)} className="md:hidden text-2xl">
            <IoMdMenu />
          </button>
        </div>
      </header>

      {/* OVERLAY FONDO */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition ${
          open ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* MENÚ DESLIZANTE MÓVIL */}
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
          <NavLink to="/addDualStudent" label="Alumnos" />
          <NavLink to="/addCompanyRequest" label="Empresas" />
          {user && <NavLink to="/linkStudents" label="Enlazar" />}

          {location !== "/login" && (
            <button
              onClick={() => {
                logout(navigate);
                setOpen(false);
              }}
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
