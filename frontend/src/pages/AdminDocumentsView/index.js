import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useConvocatoriaEstado } from "../../hooks/useConvocatoriaEstado.js";
import { FaBuildingColumns, FaFileLines, FaHourglassHalf } from "react-icons/fa6";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Tabs from "../../components/ui/Tabs.jsx";
import Seguimiento from "./Seguimiento.jsx";
import Plantillas from "./Plantillas.jsx";
import "../../styles/forms.css";

export default function AdminDocumentsView() {
  // ?vista=plantillas opens the Plantillas tab (link from the panel warning).
  const [tab, setTab] = useState(() =>
    new URLSearchParams(window.location.search).get("vista") === "plantillas" ? "plantillas" : "seguimiento",
  );
  const [summary, setSummary] = useState(null);

  // Like every other staff list, Seguimiento starts on the active convocatoria
  // (a link or bookmark with ?convocatoria= keeps its own choice).
  const [params, setParams] = useSearchParams();
  const estado = useConvocatoriaEstado();
  const [defaultReady, setDefaultReady] = useState(() => params.has("convocatoria"));
  useEffect(() => {
    if (defaultReady || estado.status === "loading") return;
    const activa = estado.data?.activa?.id_convocatoria;
    if (activa) {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("convocatoria", String(activa));
        return next;
      }, { replace: true });
    }
    setDefaultReady(true);
  }, [defaultReady, estado.status, estado.data, setParams]);


  return (
    <div className="flex-1 bg-surface-100">
      <div className="page-container space-y-6">
        <PageHeader
          kicker="Gestión"
          title="Documentos"
          subtitle="Consulta, valida y controla los documentos del proceso Dual."
          className="!mb-0"
        />

        {tab === "seguimiento" && <SummaryCards summary={summary} />}

        <Tabs
          label="Vista de documentos"
          tabs={[
            { id: "seguimiento", label: "Seguimiento" },
            { id: "plantillas", label: "Plantillas" },
          ]}
          value={tab}
          onChange={setTab}
        >
        {tab === "seguimiento" ? (
          defaultReady ? (
            <Seguimiento onSummary={setSummary} onOpenTemplates={() => setTab("plantillas")} />
          ) : (
            <p className="text-sm text-muted">Cargando…</p>
          )
        ) : (
          <Plantillas />
        )}
        </Tabs>
      </div>
    </div>
  );
}

// Totals for the current filters. "Total" also shows how many are already
// complete (total minus pendientes).
function SummaryCards({ summary }) {
  const total = summary?.total;
  const pendientes = summary?.pendientes;
  const alDia = total == null || pendientes == null ? null : Math.max(total - pendientes, 0);
  const pct = alDia == null || !total ? 0 : Math.round((alDia / total) * 100);
  const cards = [
    {
      label: "Documentos",
      value: total,
      hint: alDia == null ? "En seguimiento" : `${alDia} completados · ${pct}%`,
      Icon: FaFileLines,
      tone: "bg-surface-100 text-charcoal-700",
      progress: pct,
    },
    {
      label: "Pendientes",
      value: pendientes,
      hint: "Por generar, subir, firmar o validar",
      Icon: FaHourglassHalf,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Acción del centro",
      value: summary?.accionCentro,
      hint: "Esperan a que el centro actúe",
      Icon: FaBuildingColumns,
      tone: "bg-brand-50 text-brand-700",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
      {cards.map(({ label, value, hint, Icon, tone, progress }) => (
        <div key={label} className="rounded-xl2 border border-surface-200 bg-white p-4 shadow-card">
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <Icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-sm font-medium text-charcoal-700">{label}</p>
              <p className="m-0 mt-0.5 text-2xl font-semibold leading-tight text-charcoal-950">{value == null ? "—" : value}</p>
            </div>
          </div>
          {progress != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-100" aria-hidden="true">
              <div className="h-full rounded-full bg-green-600 transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
          <p className={`m-0 text-xs text-muted ${progress != null ? "mt-2" : "mt-3"}`}>{hint}</p>
        </div>
      ))}
    </div>
  );
}
