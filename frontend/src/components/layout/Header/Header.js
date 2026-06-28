import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useUser } from "../../../context/UserContext";
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

function Header({ sidebarCollapsed = false, onSidebarToggle }) {
  const { user, logout } = useUser();
  const location = useLocation().pathname;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const desktopSidebarRef = useRef(null);

  const isAdmin = user?.rol === "ADMINISTRADOR" || user?.rol === "COORDINADOR";
  const sessionLabel = user ? "Salir" : "Login";
  const SessionIcon = user ? FaRightFromBracket : FaRightToBracket;

  // Close the expanded desktop sidebar when the user clicks anywhere outside it.
  useEffect(() => {
    if (sidebarCollapsed) {
      return undefined;
    }

    const handleOutsidePointerDown = (event) => {
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      const clickedInsideSidebar = desktopSidebarRef.current?.contains(
        event.target,
      );

      if (isDesktop && !clickedInsideSidebar) {
        onSidebarToggle();
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [sidebarCollapsed, onSidebarToggle]);

  // Visible links depend on the current user's role.
  const items = [
    { to: "/", label: "Inicio", Icon: FaHouse, show: true },
    {
      to: "/addDualStudent",
      label: "Alumnos",
      Icon: FaUserGraduate,
      show: !user || isAdmin,
    },
    {
      to: "/addCompanyRequest",
      label: "Empresas",
      Icon: FaBuilding,
      show: !user || isAdmin,
    },
    {
      to: "/companyMain",
      label: "Mi empresa",
      Icon: FaBuilding,
      show: user?.rol === "EMPRESA",
    },
    {
      to: "/companiesView",
      label: "Empresas colaboradoras",
      Icon: FaFileSignature,
      show: isAdmin,
    },
    {
      to: "/convocatorias",
      label: "Convocatorias",
      Icon: MdEventNote,
      show: isAdmin,
    },
    {
      to: "/linkStudents",
      label: "Enlazar",
      Icon: FaLink,
      show: !!user,
    },
  ].filter((item) => item.show);

  // Shared brand lockup for desktop and mobile headers.
  const Brand = ({ compact = false }) => (
    <Link
      to="/"
      onClick={() => setOpen(false)}
      className="inline-flex min-w-0 items-center gap-3 rounded-lg py-1 outline-none transition-[background-color,box-shadow] duration-150 ease-out hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
      aria-label="Gestor FP Dual - Inicio"
    >
      <img
        src="logo.png"
        alt="Salesianos"
        className={compact ? "h-8 w-8 shrink-0" : "h-9 w-9 shrink-0"}
      />

      <div className="min-w-0">
        <div className="truncate font-display text-base font-semibold leading-tight tracking-normal text-white">
          Gestor FP Dual
        </div>

        <div className="mt-0.5 truncate text-[0.66rem] font-semibold uppercase tracking-widest text-white/60">
          Salesianos Zaragoza
        </div>
      </div>
    </Link>
  );

  // Desktop labels fade while sidebar icons remain pinned in place.
  const NavItems = ({ mobile = false }) => (
    <nav className="flex flex-col gap-1.5" aria-label="Navegación principal">
      {items.map(({ to, label, Icon }) => {
        const active = location === to;

        if (mobile) {
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-lg border px-3 text-sm font-medium outline-none transition-[background-color,border-color,color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none ${
                active
                  ? "border-brand-500/20 bg-brand-500/15 text-white"
                  : "border-transparent text-white/75 hover:border-white/10 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  active ? "text-brand-300" : "text-white/45"
                }`}
              />

              <span className="truncate">{label}</span>
            </Link>
          );
        }

        return (
          <Link
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            aria-label={sidebarCollapsed ? label : undefined}
            title={sidebarCollapsed ? label : undefined}
            className={`group relative flex h-11 w-full items-center overflow-hidden rounded-lg border px-3 outline-none transition-[background-color,border-color,color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none ${
              active
                ? "border-brand-500/20 bg-brand-500/10 text-white"
                : "border-transparent text-white/70 hover:border-white/10 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span
              className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r transition-[height,background-color] duration-300 ease-in-out motion-reduce:transition-none ${
                active ? "bg-brand-500" : "bg-transparent"
              } ${sidebarCollapsed ? "h-6" : ""}`}
            />

            <Icon
              className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-150 ease-out motion-reduce:transition-none ${
                active
                  ? "text-brand-300"
                  : "text-white/45 group-hover:text-white"
              }`}
            />

            <span
              className={`pointer-events-none absolute left-10 right-3 truncate whitespace-nowrap text-sm font-medium transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
                sidebarCollapsed ? "opacity-0" : "opacity-100"
              }`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  // Existing session behaviour is preserved for logout or login.
  const handleSessionAction = () => {
    logout(navigate);
    setOpen(false);
  };

  return (
    <>
      {/* Desktop sidebar navigation */}
      <aside
        ref={desktopSidebarRef}
        className="sticky top-0 z-20 hidden h-screen min-h-0 overflow-hidden border-r border-white/10 bg-charcoal-950 px-3 py-5 text-white shadow-shell md:col-start-1 md:row-span-2 md:flex md:flex-col"
      >
        {/* Sidebar heading and collapse control */}
        <div className="relative flex h-9 shrink-0 items-center overflow-hidden">
          <span
            className={`pointer-events-none absolute left-1 right-10 truncate whitespace-nowrap text-sm font-semibold uppercase tracking-[0.12em] text-white/70 transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
              sidebarCollapsed ? "opacity-0" : "opacity-100"
            }`}
          >
            Menú
          </span>

          <button
            type="button"
            onClick={onSidebarToggle}
            aria-label={
              sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"
            }
            aria-expanded={!sidebarCollapsed}
            title={
              sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"
            }
            className={`absolute top-1/2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm text-white/70 outline-none transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-brand-400/40 hover:bg-white/10 hover:text-white active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none ${
              sidebarCollapsed
                ? "left-1/2 -translate-x-1/2 -translate-y-1/2"
                : "right-0 -translate-y-1/2"
            }`}
          >
            {sidebarCollapsed ? <FaAnglesRight /> : <FaAnglesLeft />}
          </button>
        </div>

        <div className="mt-4 h-px w-full bg-brand-500" />

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          <NavItems />
        </div>

        {location !== "/login" && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={handleSessionAction}
              aria-label={sessionLabel}
              title={sidebarCollapsed ? sessionLabel : undefined}
              className="group relative flex h-11 w-full items-center overflow-hidden rounded-lg border border-white/10 bg-white/5 px-3 text-white/80 outline-none transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-brand-400/50 hover:bg-brand-500/15 hover:text-white active:translate-y-px focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
            >
              <SessionIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-white/45 transition-colors duration-150 ease-out group-hover:text-white motion-reduce:transition-none" />

              <span
                className={`pointer-events-none absolute left-10 right-3 truncate whitespace-nowrap text-sm font-semibold transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
                  sidebarCollapsed ? "opacity-0" : "opacity-100"
                }`}
              >
                {sessionLabel}
              </span>
            </button>
          </div>
        )}
      </aside>

      {/* Desktop account header */}
      <header className="hidden min-w-0 border-b border-white/10 bg-charcoal-900 text-white md:sticky md:top-0 md:z-30 md:col-start-2 md:row-start-1 md:grid md:h-16 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4 md:px-5 lg:px-7">
        <div className="min-w-0">
          <Brand />
        </div>

        {location !== "/login" && (
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {user && (
              <>
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-charcoal-900"
                  aria-hidden="true"
                >
                  {user.nombre?.trim()?.charAt(0).toUpperCase() || "U"}
                </div>

                <div className="hidden min-w-0 lg:flex lg:max-w-48 lg:flex-col xl:max-w-56">
                  <span className="truncate text-sm font-semibold text-white">
                    {user.nombre}
                  </span>

                  {user.rol && (
                    <span className="truncate text-[0.68rem] font-semibold uppercase tracking-wider text-white/55">
                      {user.rol}
                    </span>
                  )}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={handleSessionAction}
              aria-label={sessionLabel}
              title={sessionLabel}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-2.5 text-sm font-semibold text-white/85 outline-none transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-brand-400/50 hover:bg-brand-500/15 hover:text-white active:translate-y-px focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none lg:px-3"
            >
              <SessionIcon className="h-4 w-4 shrink-0" />
              <span className="hidden xl:inline">{sessionLabel}</span>
            </button>
          </div>
        )}
      </header>

      {/* Mobile top header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-charcoal-950 px-4 text-white shadow-sm md:hidden">
        <Brand compact />

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir navegación"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-2xl outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
        >
          <IoMdMenu />
        </button>
      </header>

      {/* Mobile drawer backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 ease-out motion-reduce:transition-none md:hidden ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Mobile navigation drawer */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[min(22rem,88vw)] flex-col bg-charcoal-950 text-white shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Navegación móvil"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <Brand compact />

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar navegación"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-2xl outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
          >
            <IoMdClose />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {user && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <span className="block text-[0.66rem] font-semibold uppercase tracking-widest text-brand-200/80">
                Sesión
              </span>

              <span className="mt-1 block truncate text-sm font-semibold text-white">
                {user.nombre}
              </span>

              {user.rol && (
                <span className="mt-1 block truncate text-[0.72rem] text-white/45">
                  {user.rol}
                </span>
              )}
            </div>
          )}

          <NavItems mobile />

          {location !== "/login" && (
            <button
              type="button"
              onClick={handleSessionAction}
              className="mt-auto flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white/85 outline-none transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-brand-400/50 hover:bg-brand-500/15 hover:text-white active:translate-y-px focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
            >
              <SessionIcon className="h-4 w-4 shrink-0" />
              <span>{sessionLabel}</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

export default Header;
