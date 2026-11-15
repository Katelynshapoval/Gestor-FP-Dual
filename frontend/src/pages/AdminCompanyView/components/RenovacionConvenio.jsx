import { useState } from "react";
import { Link } from "react-router-dom";
import { FaArrowsRotate, FaCircleCheck } from "react-icons/fa6";
import MotivoDialog from "../../../components/ui/MotivoDialog.jsx";
import { postJSON } from "../../../utils/api.js";
import { useToast } from "../../../components/feedback/ToastProvider.jsx";
import LongText from "../../../components/ui/LongText.jsx";
import { formatDate } from "../helpers";

// The three steps of a convenio renewal and which one is next, from the
// state of the application's current convenio.
export function pasosRenovacion(convenioStatus) {
  const generado = convenioStatus !== "sin_convenio";
  const firmado = convenioStatus === "pendiente";
  return [
    { texto: "Generar el convenio nuevo (si falta la plantilla, súbela antes en Documentos › Plantillas).", hecho: generado },
    {
      texto: convenioStatus === "rechazado"
        ? "La empresa tiene que subir de nuevo el convenio firmado (el último se rechazó)."
        : "La empresa lo firma y lo sube desde su portal.",
      hecho: firmado,
    },
    { texto: "Validar el convenio firmado. Al validarlo se cierra la renovación.", hecho: false },
  ];
}

const documentosConvenio = (empresa) =>
  `/documentos?${new URLSearchParams({ documento: "CONVENIO", empresa: empresa.empresa || "" })}`;

/**
 * Convenio renewal of a company application (migration 026): why it has to be
 * renewed, the ciclos before and after and what is left to do; or, without a
 * renewal, «Sustituir convenio» for the centre and where an inherited convenio
 * comes from. The company stays validated meanwhile.
 */
export default function RenovacionConvenio({ empresa, convenioStatus, onUpdated }) {
  const toast = useToast();
  const [sustituyendo, setSustituyendo] = useState(false);
  const r = empresa.renovacion_convenio;
  const puedeSustituir = !r && empresa.convocatoria_activa && convenioStatus !== "sin_convenio"
    && empresa.estado_validacion !== "RECHAZADO" && empresa.estado_validacion !== "BAJA";

  const sustituir = async (motivo) => {
    const data = await postJSON(`/solicitudes/empresa/${empresa.id_solicitud_empresa}/convenio/sustituir`, { motivo });
    toast.success(data?.message || "Convenio sustituido.");
    setSustituyendo(false);
    if (onUpdated) await onUpdated();
  };

  if (!r) {
    return (
      <>
        {empresa.convenio_heredado_de && (
          <p className="m-0 mt-2 text-xs leading-5 text-muted">
            Es el mismo convenio de la convocatoria {empresa.convenio_heredado_de}: la empresa pide los mismos ciclos, así que no ha tenido que firmar otro.
          </p>
        )}
        {puedeSustituir && (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-2"
              onClick={() => setSustituyendo(true)}
            >
              <FaArrowsRotate aria-hidden="true" className="text-xs text-brand-600" />
              Sustituir convenio
            </button>
            <span onClick={(e) => e.stopPropagation()}>
              <MotivoDialog
                open={sustituyendo}
                onClose={() => setSustituyendo(false)}
                onConfirm={sustituir}
                title="Sustituir convenio"
                description={`El convenio actual de ${empresa.empresa} pasa al historial y se genera uno nuevo que la empresa tendrá que firmar. La empresa sigue validada mientras tanto.`}
                label="Por qué se sustituye"
                placeholder="Ej. cambio de representante legal"
                confirmLabel="Sustituir convenio"
                busyLabel="Sustituyendo…"
                maxLength={300}
                tone="primary"
              />
            </span>
          </>
        )}
      </>
    );
  }

  const pasos = pasosRenovacion(convenioStatus);
  const siguiente = pasos.findIndex((p) => !p.hecho);
  return (
    <section aria-label="Renovación del convenio" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="m-0 flex items-center gap-2 font-semibold">
        <FaArrowsRotate aria-hidden="true" className="shrink-0 text-amber-700" />
        Convenio por renovar
      </p>
      <p className="m-0 mt-1 break-words text-xs leading-5">
        {r.motivo === "MANUAL" ? "Sustituido por el centro: " : ""}
        <LongText>{r.detalle}</LongText>
        {r.creado_en ? ` · ${formatDate(r.creado_en)}` : ""}
      </p>
      {(r.ciclos_antes || r.ciclos_ahora) && (
        <dl className="m-0 mt-2 grid gap-x-3 gap-y-0.5 text-xs leading-5 sm:grid-cols-[auto_1fr]">
          {r.ciclos_antes && (
            <>
              <dt className="font-semibold">Antes</dt>
              <dd className="m-0 break-words">{r.ciclos_antes}</dd>
            </>
          )}
          {r.ciclos_ahora && (
            <>
              <dt className="font-semibold">Ahora</dt>
              <dd className="m-0 break-words">{r.ciclos_ahora}</dd>
            </>
          )}
        </dl>
      )}
      <ol className="m-0 mt-2 list-none space-y-1 p-0">
        {pasos.map((p, i) => (
          <li key={p.texto} className={`flex items-start gap-2 text-xs leading-5 ${p.hecho ? "text-amber-800/70 line-through decoration-amber-400" : ""}`}>
            {p.hecho ? (
              <FaCircleCheck aria-label="Hecho" className="mt-0.5 shrink-0 text-green-700" />
            ) : (
              <span
                aria-hidden="true"
                className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                  i === siguiente ? "border-amber-700 bg-amber-700 text-white" : "border-amber-400 text-amber-800"
                }`}
              >
                {i + 1}
              </span>
            )}
            <span>
              {p.texto}
              {i === siguiente && <span className="sr-only"> (siguiente paso)</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-2 text-xs leading-5">
        La empresa sigue validada mientras tanto.{" "}
        {siguiente !== 1 && (
          <Link to={documentosConvenio(empresa)} className="font-semibold text-amber-900 underline underline-offset-2">
            Ir al convenio en Documentos
          </Link>
        )}
      </p>
    </section>
  );
}
