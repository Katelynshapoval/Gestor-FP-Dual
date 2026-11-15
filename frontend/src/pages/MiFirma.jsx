import { useCallback, useEffect, useState } from "react";
import { FaLock, FaPenNib, FaUserShield } from "react-icons/fa6";
import PageHeader from "../components/ui/PageHeader.jsx";
import { InlineLoading } from "../components/ui/Loading.jsx";
import FirmaDialog from "../components/firma/FirmaDialog.jsx";
import { FirmarTodoBoton } from "../components/firma/FirmarDocumentos.jsx";
import { cargarMiFirma, eliminarFirma, fechaFirma } from "../utils/firma.js";
import { useConfirm, useToast } from "../components/feedback/ToastProvider.jsx";

const ORIGEN = { PANTALLA: "dibujada en pantalla", MOVIL: "hecha con el móvil", FICHERO: "subida como imagen" };

// One saved signature: the image on paper, when it was made, change and delete.
function TarjetaFirma({ titulo, ayuda, firma, vacio, onCambiar, onEliminar, ocupado }) {
  return (
    <section className="form-card mb-0">
      <h2 className="form-section-title">{titulo}</h2>
      {ayuda && <p className="-mt-1 mb-4 text-sm leading-6 text-muted">{ayuda}</p>}
      {firma ? (
        <>
          <div className="firma-papel flex h-44 items-center justify-center rounded-xl border border-surface-200 p-5">
            <img src={firma.imagen} alt={titulo} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-xs leading-5 text-muted">
              Guardada el {fechaFirma(firma.creado_en)}
              {ORIGEN[firma.origen] ? `, ${ORIGEN[firma.origen]}` : ""}.
            </p>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn btn-danger btn-sm" onClick={onEliminar} disabled={ocupado}>
                Eliminar
              </button>
              <button type="button" className="btn btn-outline-brand btn-sm" onClick={onCambiar} disabled={ocupado}>
                Cambiar firma
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-surface-300 bg-surface-50 px-6 py-10 text-center">
          <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-700 shadow-card">
            <FaPenNib className="h-4 w-4" />
          </span>
          <p className="m-0 max-w-sm text-sm leading-6 text-charcoal-800">{vacio}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onCambiar}>
            Crear firma
          </button>
        </div>
      )}
    </section>
  );
}

// "Mi firma" (students and companies): the signature is asked for once and
// changes only here. Documents already signed keep the image they were signed with.
export default function MiFirma() {
  const toast = useToast();
  const confirm = useConfirm();
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState("");
  const [dialogo, setDialogo] = useState(null); // "USUARIO" | "TUTOR"
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    setError("");
    cargarMiFirma()
      .then(setEstado)
      .catch((err) => setError(err.message || "No se pudo cargar tu firma."));
  }, []);
  useEffect(cargar, [cargar]);

  const eliminar = async (titular) => {
    const deTutor = titular === "TUTOR";
    const aceptado = await confirm({
      title: deTutor ? "Eliminar la firma del tutor legal" : "Eliminar mi firma",
      message:
        "La imagen se borra de la aplicación. Los documentos ya firmados no cambian. Para firmar otro documento habrá que crearla de nuevo.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!aceptado) return;
    setOcupado(true);
    try {
      setEstado(await eliminarFirma(titular));
      toast.success("Firma eliminada.");
    } catch (err) {
      toast.error(err.message || "No se pudo eliminar la firma.");
    } finally {
      setOcupado(false);
    }
  };

  const tutorVisible = estado && (estado.requiere_tutor || estado.firma_tutor);

  return (
    <div className="page-container">
      <PageHeader
        kicker="Cuenta"
        title="Mi firma"
        subtitle="La creas una vez y se inserta en los documentos cuando pulsas Firmar."
        actions={<FirmarTodoBoton />}
      />
      {error ? (
        <div role="alert" className="form-card text-center">
          <p className="m-0 font-semibold text-charcoal-950">No se pudo cargar tu firma.</p>
          <p className="m-0 mt-2 text-sm text-muted">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={cargar}>
            Reintentar
          </button>
        </div>
      ) : !estado ? (
        <InlineLoading centrado>Cargando tu firma…</InlineLoading>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <TarjetaFirma
              titulo="Tu firma"
              firma={estado.firma}
              vacio="Todavía no has creado tu firma. Puedes dibujarla aquí o con el móvil, escaneando un código."
              onCambiar={() => setDialogo("USUARIO")}
              onEliminar={() => eliminar("USUARIO")}
              ocupado={ocupado}
            />
            {tutorVisible && (
              <TarjetaFirma
                titulo="Firma de tu tutor o tutora legal"
                ayuda={
                  estado.requiere_tutor
                    ? `Eres menor de edad: ${estado.tutor_nombre || "tu tutor o tutora legal"} firma contigo los documentos. Tiene que hacer la firma en persona.`
                    : "Ya eres mayor de edad: esta firma no se usa en los documentos nuevos. Puedes eliminarla."
                }
                firma={estado.firma_tutor}
                vacio={`Falta la firma de ${estado.tutor_nombre || "tu tutor o tutora legal"}. Sin ella no puedes firmar documentos.`}
                onCambiar={() => setDialogo("TUTOR")}
                onEliminar={() => eliminar("TUTOR")}
                ocupado={ocupado}
              />
            )}
          </div>

          <aside className="space-y-4" aria-label="Cómo se usa tu firma">
            <section className="rounded-lg border border-surface-200 bg-white p-5 shadow-card">
              <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-charcoal-950">
                <FaPenNib aria-hidden="true" className="h-4 w-4 text-brand-700" />
                Cómo se usa
              </h2>
              <ul className="m-0 mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-charcoal-700">
                <li>Nunca se pone sola: solo cuando tú pulsas Firmar en un documento.</li>
                <li>Antes de firmar ves el documento con la firma colocada en su sitio.</li>
                <li>Si la cambias, los documentos ya firmados conservan la anterior.</li>
              </ul>
            </section>
            <section className="rounded-lg border border-surface-200 bg-surface-50 p-5">
              <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-charcoal-950">
                <FaLock aria-hidden="true" className="h-4 w-4 text-charcoal-700" />
                Privacidad
              </h2>
              <p className="m-0 mt-3 text-sm leading-6 text-charcoal-700">
                Solo tú ves esta imagen. El centro y {estado.requiere_tutor !== undefined ? "la empresa" : "los alumnos"} la ven
                únicamente dentro de los documentos que firmas. Cada firma queda registrada con la fecha y tu cuenta.
              </p>
            </section>
            {estado.requiere_tutor && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
                <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-amber-950">
                  <FaUserShield aria-hidden="true" className="h-4 w-4" />
                  Menores de edad
                </h2>
                <p className="m-0 mt-3 text-sm leading-6 text-amber-950">
                  Hasta que cumplas 18 años, tus documentos llevan también la firma de tu tutor o tutora legal.
                </p>
              </section>
            )}
          </aside>
        </div>
      )}

      <FirmaDialog
        open={Boolean(dialogo)}
        titular={dialogo || "USUARIO"}
        cambiar={dialogo === "TUTOR" ? Boolean(estado?.firma_tutor) : Boolean(estado?.firma)}
        tutorNombre={estado?.tutor_nombre}
        onClose={() => setDialogo(null)}
        onSaved={setEstado}
      />
    </div>
  );
}
