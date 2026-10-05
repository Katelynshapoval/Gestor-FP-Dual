import { useEffect, useState } from "react";
import { getJSON } from "../../utils/api.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Seguimiento from "./Seguimiento.jsx";
import Plantillas from "./Plantillas.jsx";
import "../../styles/forms.css";

export default function AdminDocumentsView() {
  const [tab, setTab] = useState("seguimiento");
  const [items, setItems] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    const [docs, templates] = await Promise.all([
      getJSON("/documentos/seguimiento"),
      getJSON("/documentos/plantillas"),
    ]);
    setItems(Array.isArray(docs?.items) ? docs.items : []);
    setTipos(Array.isArray(templates?.tipos) ? templates.tipos : []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err.message || "No se pudieron cargar los documentos."))
      .finally(() => setLoading(false));
  }, []);

  const tabCls = (active) =>
    `whitespace-nowrap px-5 py-2.5 text-sm font-semibold transition border-b-2 ${
      active ? "border-brand-500 text-brand-500" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="page-container">
      <PageHeader
        kicker="Administración"
        title="Documentos"
        subtitle="Seguimiento de requisitos, estados y plantillas de generación."
      />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-surface-200">
        <button type="button" className={tabCls(tab === "seguimiento")} onClick={() => setTab("seguimiento")}>
          Seguimiento
        </button>
        <button type="button" className={tabCls(tab === "plantillas")} onClick={() => setTab("plantillas")}>
          Plantillas
        </button>
      </div>
      {loading ? (
        <p className="py-16 text-center text-gray-400">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : tab === "seguimiento" ? (
        <Seguimiento items={items} onChange={setItems} onOpenTemplates={() => setTab("plantillas")} />
      ) : (
        <Plantillas
          tipos={tipos}
          onChange={async () => {
            const templates = await getJSON("/documentos/plantillas");
            setTipos(Array.isArray(templates?.tipos) ? templates.tipos : []);
            const docs = await getJSON("/documentos/seguimiento");
            setItems(Array.isArray(docs?.items) ? docs.items : []);
          }}
        />
      )}
    </div>
  );
}
