import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../../../context/UserContext";
import { useState } from "react";
import { IoMdClose, IoMdMenu } from "react-icons/io";
import {
  FaAnglesLeft,
  FaAnglesRight,
  FaBuilding,
  FaFileSignature,
  FaHouse,
  FaLink,
  FaRightFromBracket,
  FaRightToBracket,
  FaUserGraduate,
} from "react-icons/fa6";
import { MdEventNote } from "react-icons/md";
import "./Header.css";

function Header({ sidebarCollapsed = false, onSidebarToggle }) {
  const { user, logout } = useUser();
  const location = useLocation().pathname;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isAdmin = user?.rol === "ADMINISTRADOR" || user?.rol === "COORDINADOR";

  const items = [
    { to: "/", label: "Inicio", Icon: FaHouse, show: true },
    { to: "/addDualStudent", label: "Alumnos", Icon: FaUserGraduate, show: !user || isAdmin },
    { to: "/addCompanyRequest", label: "Empresas", Icon: FaBuilding, show: !user || isAdmin },
    { to: "/companyMain", label: "Mi empresa", Icon: FaBuilding, show: user?.rol === "EMPRESA" },
    { to: "/companiesView", label: "Empresas colaboradoras", Icon: FaFileSignature, show: isAdmin },
    { to: "/convocatorias", label: "Convocatorias", Icon: MdEventNote, show: isAdmin },
    { to: "/linkStudents", label: "Enlazar", Icon: FaLink, show: !!user },
  ].filter((item) => item.show);

  const Brand = ({ compact = false, collapsed = false }) => (
    <Link
      to="/"
      onClick={() => setOpen(false)}
      className={`brand-lockup ${collapsed ? "brand-lockup-collapsed" : ""}`}
      aria-label="Gestor FP Dual - Inicio"
      title={collapsed ? "Gestor FP Dual" : undefined}
    >
      <img src="logo.png" alt="Salesianos" className={compact || collapsed ? "h-8 w-8" : "h-9 w-9"} />
      <div className="brand-text">
        <div className="brand-title">Gestor FP Dual</div>
        <div className="brand-subtitle">Salesianos Zaragoza</div>
      </div>
    </Link>
  );

  const NavItems = ({ mobile = false }) => (
    <nav className={mobile ? "mobile-nav-list" : "nav-list"} aria-label="Navegación principal">
      {items.map(({ to, label, Icon }) => {
        const active = location === to;
        const collapsedTooltip = sidebarCollapsed && !mobile;
        return (
          <Link
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={`nav-link ${active ? "nav-link-active" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-label={collapsedTooltip ? label : undefined}
            title={collapsedTooltip ? label : undefined}
          >
            <Icon className="nav-icon" />
            <span className="nav-label">{label}</span>
            {collapsedTooltip && <span className="nav-tooltip">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const handleSessionAction = () => {
    logout(navigate);
    setOpen(false);
  };

  const sessionLabel = user ? "Salir" : "Login";
  const SessionIcon = user ? FaRightFromBracket : FaRightToBracket;

  return (
    <>
      <aside className={`app-sidebar ${sidebarCollapsed ? "app-sidebar-collapsed" : ""}`}>
        <div className="sidebar-top">
          <Brand collapsed={sidebarCollapsed} />
          <button
            type="button"
            className="sidebar-collapse-button"
            onClick={onSidebarToggle}
            aria-label={sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"}
          >
            {sidebarCollapsed ? <FaAnglesRight /> : <FaAnglesLeft />}
            {sidebarCollapsed && <span className="nav-tooltip">Expandir</span>}
          </button>
          <div className="sidebar-marker" />
          {user && (
            <div className="nav-welcome">
              <span className="nav-welcome-label">Sesión</span>
              <span className="nav-welcome-name">{user.nombre}</span>
              {user.rol && <span className="nav-welcome-role">{user.rol}</span>}
            </div>
          )}
          <NavItems />
        </div>

        {location !== "/login" && (
          <button
            onClick={handleSessionAction}
            className="nav-session-button"
            aria-label={sessionLabel}
            title={sidebarCollapsed ? sessionLabel : undefined}
          >
            <SessionIcon className="nav-icon" />
            <span className="nav-label">{sessionLabel}</span>
            {sidebarCollapsed && <span className="nav-tooltip">{sessionLabel}</span>}
          </button>
        )}
      </aside>

      <header className="mobile-header">
        <Brand compact />
        <button
          onClick={() => setOpen(true)}
          className="mobile-menu-button"
          aria-label="Abrir navegación"
          type="button"
        >
          <IoMdMenu />
        </button>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onClick={() => setOpen(false)}
      />

      <div className={`mobile-drawer ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <Brand compact />
          <button
            onClick={() => setOpen(false)}
            className="mobile-close-button"
            aria-label="Cerrar navegación"
            type="button"
          >
            <IoMdClose />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 px-5 py-5">
          {user && (
            <div className="nav-welcome">
              <span className="nav-welcome-label">Sesión</span>
              <span className="nav-welcome-name">{user.nombre}</span>
            </div>
          )}
          <NavItems mobile />

          {location !== "/login" && (
            <button onClick={handleSessionAction} className="nav-session-button mt-auto">
              <SessionIcon className="nav-icon" />
              <span className="nav-label">{sessionLabel}</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default Header;
