import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { getJSON } from "../../utils/api.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import MisDatos from "./MisDatos.jsx";
import MisReservas from "./MisReservas.jsx";
import MisDocumentos from "./MisDocumentos.jsx";
import "../../styles/forms.css";

function StudentMain() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [view, setView] = useState("datos");
  const [solicitud, setSolicitud] = useState(null);
  const [reservas, setReservas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // WF-17: "no application" is recognised by status and code, not by message text.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      getJSON("/solicitudes/alumno/mia").catch((err) => {
        if (err.status === 404 && err.code === "SIN_SOLICITUD") return null;
        throw err;
      }),
      getJSON("/reservas/alumno"),
      getJSON("/documentos/alumno/mios"),
    ])
      .then(([sol, resv, docs]) => {
        setSolicitud(sol);
        setReservas(Array.isArray(resv) ? resv : []);
        setDocumentos(Array.isArray(docs?.items) ? docs.items : []);
      })
      .catch((err) => setError(err.message || "No se pudo cargar tu proceso Dual."))
      .finally(() => setLoading(false));
  }, []);

  // Refresh after an action inside a reservation (e.g. signing), without the loading screen.
  const refresh = useCallback(async () => {
    try {
      const [resv, docs] = await Promise.all([getJSON("/reservas/alumno"), getJSON("/documentos/alumno/mios")]);
      setReservas(Array.isArray(resv) ? resv : []);
      setDocumentos(Array.isArray(docs?.items) ? docs.items : []);
    } catch {
      /* the panel already reported the error */
    }
  }, []);

  useEffect(() => {
    if (!user || user.rol !== "ALUMNO") {
      navigate("/login");
      return;
    }
    load();
  }, [user, navigate, load]);

  if (!user || user.rol !== "ALUMNO") return null;

  const tabCls = (active) =>
    `whitespace-nowrap px-5 py-2.5 text-sm font-semibold transition border-b-2 ${
      active ? "border-brand-500 text-brand-500" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="page-container">
      <PageHeader
        kicker="Alumno"
        title="Portal Alumno — Dual"
        subtitle={`${user.nombre}${user.dni ? ` · ${user.dni}` : ""}`}
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-surface-200" role="tablist" aria-label="Secciones del portal">
        <button type="button" role="tab" aria-selected={view === "datos"} className={tabCls(view === "datos")} onClick={() => setView("datos")}>
          Mis datos
        </button>
        <button type="button" role="tab" aria-selected={view === "reservas"} className={tabCls(view === "reservas")} onClick={() => setView("reservas")}>
          Mis reservas
          {reservas.length > 0 && (
            <span className="ml-1.5 inline-block rounded-full bg-brand-500 px-1.5 py-0.5 text-[0.7rem] leading-none text-white">
              {reservas.length}
            </span>
          )}
        </button>
        <button type="button" role="tab" aria-selected={view === "documentos"} className={tabCls(view === "documentos")} onClick={() => setView("documentos")}>
          Mis documentos
        </button>
      </div>

      {loading ? (
        <p role="status" className="py-16 text-center text-muted">Cargando…</p>
      ) : error ? (
        <div role="alert" className="form-card text-center">
          <p className="font-semibold text-charcoal-950">No se pudo cargar tu proceso Dual.</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button type="button" className="btn btn-primary btn-sm mt-4" onClick={load}>
            Reintentar
          </button>
        </div>
      ) : view === "datos" ? (
        <MisDatos solicitud={solicitud} />
      ) : view === "reservas" ? (
        <MisReservas reservas={reservas} onChanged={refresh} />
      ) : (
        <MisDocumentos documentos={documentos} onChange={setDocumentos} />
      )}
    </div>
  );
}

export default StudentMain;
