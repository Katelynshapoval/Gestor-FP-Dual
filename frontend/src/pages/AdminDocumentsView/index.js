import { useState } from "react";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Seguimiento from "./Seguimiento.jsx";
import Plantillas from "./Plantillas.jsx";
import "../../styles/forms.css";

export default function AdminDocumentsView() {
  const [tab, setTab] = useState("seguimiento");
  const [summary, setSummary] = useState(null);

  const tabCls = (active) =>
    `whitespace-nowrap px-5 py-2.5 text-sm font-semibold transition border-b-2 ${
      active ? "border-brand-500 text-brand-500" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="flex-1 bg-surface-100">
      <div className="page-container space-y-6">
        <PageHeader
          kicker="Administración"
          title="Gestión de documentos"
          subtitle="Consulta, valida y controla los documentos del proceso Dual."
          meta={tab === "seguimiento" ? <SummaryChips summary={summary} /> : null}
        />

        <div className="flex gap-1 overflow-x-auto border-b border-surface-200">
          <button type="button" className={tabCls(tab === "seguimiento")} onClick={() => setTab("seguimiento")}>
            Seguimiento
          </button>
          <button type="button" className={tabCls(tab === "plantillas")} onClick={() => setTab("plantillas")}>
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

function SummaryChips({ summary }) {
  const chips = [
    ["Total", summary?.total],
    ["Pendientes", summary?.pendientes],
    ["Acción del centro", summary?.accionCentro],
  ];
  return (
    <>
      {chips.map(([label, value]) => (
        <div
          key={label}
          className="min-w-[8.5rem] rounded-xl2 border border-surface-200 bg-white px-3 py-2 shadow-card"
        >
          <p className="text-lg font-semibold leading-none text-charcoal-950">{value == null ? "—" : value}</p>
          <p className="mt-1 text-[0.72rem] font-medium text-muted">{label}</p>
        </div>
      ))}
    </>
  );
}
