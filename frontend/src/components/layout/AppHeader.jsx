import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaRightFromBracket } from "react-icons/fa6";
import { useUser } from "../../context/UserContext";

const ROLE_LABELS = {
  ADMINISTRADOR: "Administrador",
  COORDINADOR: "Coordinador",
  EMPRESA: "Empresa",
};

// Horizontal header with account identity and session menu
const AppHeader = () => {
  const { user, logout } = useUser();
  const location = useLocation().pathname;
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (!user || location === "/login") return null;

  const roleLabel = ROLE_LABELS[user.rol] || user.rol;
  const initial = (user.nombre || "?").charAt(0).toUpperCase();

  const handleLogout = () => {
    setMenuOpen(false);
    logout(navigate);
  };

  return (
    <header className="sticky top-0 z-20 hidden border-b border-surface-200 bg-white/95 backdrop-blur-sm md:block">
      <div className="flex h-12 items-center justify-end gap-3 px-4 sm:px-6 md:px-8">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="inline-flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left outline-none transition-[background-color,border-color] duration-150 ease-out hover:border-surface-200 hover:bg-surface-50 focus-visible:border-brand-500/30 focus-visible:ring-2 focus-visible:ring-brand-500/20"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Cuenta de ${user.nombre}`}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-charcoal-900 text-xs font-semibold text-white"
              aria-hidden="true"
            >
              {initial}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-medium leading-tight text-charcoal-950">
                {user.nombre}
              </span>
              <span className="block truncate text-[0.72rem] leading-tight text-muted">
                {roleLabel}
              </span>
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-[10rem] overflow-hidden rounded-lg border border-surface-200 bg-white py-1 shadow-sm"
            >
              <div className="border-b border-surface-200 px-3 py-2 sm:hidden">
                <p className="truncate text-sm font-medium text-charcoal-950">
                  {user.nombre}
                </p>
                <p className="truncate text-xs text-muted">{roleLabel}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-charcoal-800 transition-colors duration-150 hover:bg-surface-50 focus-visible:bg-surface-50 focus-visible:outline-none"
                onClick={handleLogout}
              >
                <FaRightFromBracket
                  className="h-3.5 w-3.5 shrink-0 text-muted"
                  aria-hidden="true"
                />
                Salir
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
