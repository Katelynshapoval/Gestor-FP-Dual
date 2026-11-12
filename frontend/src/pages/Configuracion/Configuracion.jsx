import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Tabs from "../../components/ui/Tabs.jsx";

// Administrator settings in one menu entry: each tab is its own address
// (/configuracion/<tab>), so back, bookmarks and page titles keep working.
export const CONFIG_TABS = [
  { id: "convocatorias", label: "Convocatorias" },
  { id: "personal", label: "Personal" },
  { id: "correos", label: "Correos" },
];

export default function Configuracion() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const actual = pathname.split("/")[2];

  if (!CONFIG_TABS.some((t) => t.id === actual)) {
    return <Navigate to="/configuracion/convocatorias" replace />;
  }

  // Correos has a list beside the editor and needs the extra width.
  const ancho = actual === "correos" ? " !max-w-[100rem]" : "";

  return (
    <div className={`page-container${ancho}`}>
      <PageHeader
        kicker="Administración"
        title="Configuración"
        subtitle="Periodos de solicitud, cuentas del personal y correos automáticos."
        className="!mb-5"
      />
      <Tabs
        label="Secciones de configuración"
        tabs={CONFIG_TABS}
        value={actual}
        onChange={(id) => navigate(`/configuracion/${id}`)}
      >
        <div key={actual} className="animate-fade-in">
          <Outlet />
        </div>
      </Tabs>
    </div>
  );
}

// The short description each tab shows under the tab bar (it replaces the
// page header the three pages had when they were separate).
export function SeccionIntro({ children, meta }) {
  return (
    <div className="mb-6">
      <p className="page-subtitle mb-0">{children}</p>
      {meta && <div className="mt-3 flex flex-wrap gap-2">{meta}</div>}
    </div>
  );
}
