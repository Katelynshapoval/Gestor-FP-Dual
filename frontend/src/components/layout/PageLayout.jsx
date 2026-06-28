import { useEffect, useState } from "react";
import Header from "./Header/Header";
import Footer from "./Footer/Footer";

const SIDEBAR_STORAGE_KEY = "fpdual.sidebarCollapsed";

const PageLayout = ({ children }) => {
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
    } catch {
      return;
    }
  }, [sidebarCollapsed]);

  return (
    <div
      className={`min-h-screen bg-surface-50 text-foreground md:grid md:transition-[grid-template-columns] md:duration-200 md:ease-out ${
        sidebarCollapsed
          ? "md:grid-cols-[4.5rem_minmax(0,1fr)]"
          : "md:grid-cols-[17rem_minmax(0,1fr)]"
      }`}
    >
      <Header
        sidebarCollapsed={sidebarCollapsed}
        onSidebarToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <div className="flex min-h-screen min-w-0 flex-col">
        <main className="flex flex-1 flex-col">{children}</main>
        <Footer />
      </div>
    </div>
  );
};

export default PageLayout;
