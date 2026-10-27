import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header/Header";
import Footer from "./Footer/Footer";
import { useUser } from "../../context/UserContext";
import { pageTitle } from "../../navigation.js";

const SIDEBAR_STORAGE_KEY = "fpdual.sidebarCollapsed";

const PageLayout = ({ children }) => {
  const { user } = useUser();
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  const firstRender = useRef(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    } catch {}
  }, [sidebarCollapsed]);

  // Each page has its own title; after client-side navigation focus moves to
  // the content so keyboard and screen-reader users start at the new page.
  useEffect(() => {
    document.title = `${pageTitle(pathname, user)} · FP Dual Salesianos`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname, user]);

  return (
    <div
      className={`min-h-screen bg-surface-50 text-foreground md:grid md:grid-rows-[4rem_minmax(0,1fr)] md:transition-[grid-template-columns] md:duration-200 md:ease-out motion-reduce:transition-none ${
        sidebarCollapsed ? "md:grid-cols-[4.5rem_minmax(0,1fr)]" : "md:grid-cols-[16rem_minmax(0,1fr)]"
      }`}
    >
      <a
        href="#contenido"
        className="sr-only z-[60] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-charcoal-950 shadow-card focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        Saltar al contenido
      </a>
      <Header sidebarCollapsed={sidebarCollapsed} onSidebarToggle={() => setSidebarCollapsed((value) => !value)} />

      <div className="flex min-h-0 min-w-0 flex-col md:col-start-2 md:row-start-2">
        <main id="contenido" ref={mainRef} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
          {children ?? <Outlet />}
        </main>
        <Footer />
      </div>
    </div>
  );
};

export default PageLayout;
