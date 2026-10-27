import { useState } from "react";
import { FaBuildingColumns, FaFileLines, FaHourglassHalf } from "react-icons/fa6";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Seguimiento from "./Seguimiento.jsx";
import Plantillas from "./Plantillas.jsx";
import "../../styles/forms.css";

export default function AdminDocumentsView() {
  const [tab, setTab] = useState("seguimiento");
  const [summary, setSummary] = useState(null);

  const tabCls = (active) =>
    `whitespace-nowrap px-5 py-2.5 text-sm font-semibold transition border-b-2 ${
      active ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-charcoal-900"
    }`;

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

        <div className="flex gap-1 overflow-x-auto border-b border-surface-200" role="tablist" aria-label="Vista de documentos">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "seguimiento"}
            className={tabCls(tab === "seguimiento")}
            onClick={() => setTab("seguimiento")}
          >
            Seguimiento
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "plantillas"}
            className={tabCls(tab === "plantillas")}
            onClick={() => setTab("plantillas")}
          >
            Plantillas
          </button>
        </div>

        {tab === "seguimiento" ? (
          <Seguimiento onSummary={setSummary} onOpenTemplates={() => setTab("plantillas")} />
        ) : (
          <Plantillas />
        )}
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
