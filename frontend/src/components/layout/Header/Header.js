import { Link, useLocation, useNavigate } from "react-router-dom";
import { label } from "../../../utils/labels.js";
import { useEffect, useRef, useState } from "react";
import { useUser } from "../../../context/UserContext";
import { IoMdClose, IoMdMenu } from "react-icons/io";
import { FaAnglesLeft, FaAnglesRight, FaKey, FaRightFromBracket } from "react-icons/fa6";
import { homeForRole, isActivePath, navForUser } from "../../../navigation.js";

const FOCUSABLE = 'a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])';

// Shared brand lockup for desktop and mobile headers.
const Brand = ({ to, compact = false, onNavigate }) => (
  <Link
    to={to}
    onClick={onNavigate}
    className="inline-flex min-w-0 items-center gap-3 rounded-lg py-1 outline-none transition-[background-color,box-shadow] duration-150 ease-out hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
    aria-label="Gestor FP Dual - Inicio"
  >
    <img src="/logo.png" alt="" className={compact ? "h-8 w-8 shrink-0" : "h-9 w-9 shrink-0"} />
    <div className="min-w-0">
      <div className="truncate font-display text-base font-semibold leading-tight tracking-normal text-white">
        Gestor FP Dual
      </div>
      <div className="mt-0.5 truncate text-[0.66rem] font-semibold uppercase tracking-widest text-white/70">
        Salesianos Zaragoza
      </div>
    </div>
  </Link>
);

// Desktop: icons stay pinned and labels fade when the sidebar is collapsed.
const SidebarLink = ({ item, active, collapsed }) => {
  const { to, label: text, Icon } = item;
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? text : undefined}
      title={collapsed ? text : undefined}
      className={`group relative flex h-11 w-full items-center overflow-hidden rounded-lg border px-3 outline-none transition-[background-color,border-color,color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none ${
        active
          ? "border-brand-500/30 bg-brand-500/15 text-white"
          : "border-transparent text-white/75 hover:border-white/10 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r ${active ? "bg-brand-500" : "bg-transparent"}`}
      />
      <Icon
        aria-hidden="true"
        className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-150 ease-out motion-reduce:transition-none ${
          active ? "text-brand-300" : "text-white/55 group-hover:text-white"
        }`}
      />
      <span
        className={`pointer-events-none absolute left-10 right-3 truncate whitespace-nowrap text-sm font-medium transition-opacity duration-200 ease-in-out motion-reduce:transition-none ${
          collapsed ? "opacity-0" : "opacity-100"
        }`}
      >
        {text}
      </span>
    </Link>
  );
};

const DrawerLink = ({ item, active, onNavigate }) => {
  const { to, label: text, Icon } = item;
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex h-11 items-center gap-3 rounded-lg border px-3 text-sm font-medium outline-none transition-[background-color,border-color,color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none ${
        active
          ? "border-brand-500/30 bg-brand-500/15 text-white"
          : "border-transparent text-white/80 hover:border-white/10 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-brand-300" : "text-white/55"}`} />
      <span className="truncate">{text}</span>
    </Link>
  );
};

const accountBtn =
  "group relative flex h-11 w-full items-center overflow-hidden rounded-lg border border-white/10 bg-white/5 px-3 text-white/85 outline-none transition-[background-color,border-color,color] duration-150 ease-out hover:border-brand-400/50 hover:bg-brand-500/15 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none";

function Header({ sidebarCollapsed = false, onSidebarToggle }) {
  const { user, logout } = useUser();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);
  const openerRef = useRef(null);
  const closeRef = useRef(null);

  const items = navForUser(user);
  const home = user ? homeForRole(user.rol) : "/";
  const closeDrawer = () => setOpen(false);

  // The drawer closes on navigation (back/forward included).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Closed drawer: out of the tab order and the accessibility tree (D.4).
  useEffect(() => {
    if (drawerRef.current) drawerRef.current.inert = !open;
  }, [open]);

  // Open drawer: focus inside, Escape closes, Tab stays inside, page does not
  // scroll; on close, focus returns to the menu button.
  useEffect(() => {
    if (!open) return undefined;
    const opener = openerRef.current;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const nodes = [...drawerRef.current.querySelectorAll(FOCUSABLE)];
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    logout(navigate);
  };

  const showAccount = Boolean(user) && pathname !== "/login";

  return (
    <>
      {/* Desktop sidebar: collapses only with its own button; the state is remembered. */}
      <aside className="sticky top-0 z-20 hidden h-screen min-h-0 overflow-hidden border-r border-white/10 bg-charcoal-950 px-3 py-5 text-white shadow-shell md:col-start-1 md:row-span-2 md:flex md:flex-col">
        <div className="relative flex h-9 shrink-0 items-center overflow-hidden">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-1 right-10 truncate whitespace-nowrap text-sm font-semibold uppercase tracking-[0.12em] text-white/70 transition-opacity duration-200 ease-in-out motion-reduce:transition-none ${
              sidebarCollapsed ? "opacity-0" : "opacity-100"
            }`}
          >
            Menú
          </span>
          <button
            type="button"
            onClick={onSidebarToggle}
            aria-label={sidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
            aria-expanded={!sidebarCollapsed}
            aria-controls="menu-lateral"
            title={sidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
            className={`absolute top-1/2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm text-white/75 outline-none transition-[background-color,border-color,color] duration-150 ease-out hover:border-brand-400/40 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none ${
              sidebarCollapsed ? "left-1/2 -translate-x-1/2 -translate-y-1/2" : "right-0 -translate-y-1/2"
            }`}
          >
            {sidebarCollapsed ? <FaAnglesRight aria-hidden="true" /> : <FaAnglesLeft aria-hidden="true" />}
          </button>
        </div>

        <div className="mt-4 h-px w-full bg-brand-500" />

        <nav id="menu-lateral" aria-label="Navegación principal" className="mt-5 min-h-0 flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.to}>
                <SidebarLink item={item} active={isActivePath(pathname, item)} collapsed={sidebarCollapsed} />
              </li>
            ))}
          </ul>
        </nav>

        {showAccount && (
          <div className="mt-5 flex flex-col gap-1.5 border-t border-white/10 pt-4">
            <SidebarLink
              item={{ to: "/cambiarPassword", label: "Cambiar contraseña", Icon: FaKey }}
              active={pathname === "/cambiarPassword"}
              collapsed={sidebarCollapsed}
            />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title={sidebarCollapsed ? "Cerrar sesión" : undefined}
              className={accountBtn}
            >
              <FaRightFromBracket
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55 group-hover:text-white"
              />
              <span
                className={`pointer-events-none absolute left-10 right-3 truncate whitespace-nowrap text-left text-sm font-semibold transition-opacity duration-200 motion-reduce:transition-none ${
                  sidebarCollapsed ? "opacity-0" : "opacity-100"
                }`}
              >
                Cerrar sesión
              </span>
            </button>
          </div>
        )}
      </aside>

      {/* Desktop top bar */}
      <header className="hidden min-w-0 border-b border-white/10 bg-charcoal-900 text-white md:sticky md:top-0 md:z-30 md:col-start-2 md:row-start-1 md:grid md:h-16 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4 md:px-5 lg:px-7">
        <div className="min-w-0">
          <Brand to={home} />
        </div>
        {showAccount && (
          <div className="flex shrink-0 items-center gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-charcoal-900"
              aria-hidden="true"
            >
              {user.nombre?.trim()?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="hidden min-w-0 lg:flex lg:max-w-56 lg:flex-col">
              <span className="truncate text-sm font-semibold text-white">{user.nombre}</span>
              {user.rol && (
                <span className="truncate text-[0.68rem] font-semibold uppercase tracking-wider text-white/70">
                  {label("rol", user.rol)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white/90 outline-none transition-[background-color,border-color,color] duration-150 ease-out hover:border-brand-400/50 hover:bg-brand-500/15 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
            >
              <FaRightFromBracket aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>Salir</span>
            </button>
          </div>
        )}
      </header>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-white/10 bg-charcoal-950 px-4 text-white shadow-sm md:hidden">
        <Brand to={home} compact />
        <button
          ref={openerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={open}
          aria-controls="menu-movil"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-2xl outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
        >
          <IoMdMenu aria-hidden="true" />
        </button>
      </header>

      {/* Mobile drawer backdrop (pointer only; Escape and the close button cover keyboards) */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 ease-out motion-reduce:transition-none md:hidden ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
        onClick={closeDrawer}
      />

      {/* Mobile drawer */}
      <div
        ref={drawerRef}
        id="menu-movil"
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        className={`fixed right-0 top-0 z-50 flex h-full w-[min(22rem,88vw)] flex-col bg-charcoal-950 text-white shadow-2xl transition-[transform,visibility] duration-200 ease-out motion-reduce:transition-none md:hidden ${
          open ? "visible translate-x-0" : "invisible translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <Brand to={home} compact onNavigate={closeDrawer} />
          <button
            ref={closeRef}
            type="button"
            onClick={closeDrawer}
            aria-label="Cerrar menú"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-2xl outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
          >
            <IoMdClose aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {user && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <span className="block text-[0.66rem] font-semibold uppercase tracking-widest text-brand-200">Sesión</span>
              <span className="mt-1 block truncate text-sm font-semibold text-white">{user.nombre}</span>
              {user.rol && <span className="mt-1 block truncate text-xs text-white/70">{label("rol", user.rol)}</span>}
            </div>
          )}

          <nav aria-label="Navegación principal">
            <ul className="flex flex-col gap-1.5">
              {items.map((item) => (
                <li key={item.to}>
                  <DrawerLink item={item} active={isActivePath(pathname, item)} onNavigate={closeDrawer} />
                </li>
              ))}
            </ul>
          </nav>

          {showAccount && (
            <div className="mt-auto flex flex-col gap-1.5 border-t border-white/10 pt-4">
              <DrawerLink
                item={{ to: "/cambiarPassword", label: "Cambiar contraseña", Icon: FaKey }}
                active={pathname === "/cambiarPassword"}
                onNavigate={closeDrawer}
              />
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white/90 outline-none transition-[background-color,border-color,color] duration-150 ease-out hover:border-brand-400/50 hover:bg-brand-500/15 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-300/70 motion-reduce:transition-none"
              >
                <FaRightFromBracket aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default Header;
