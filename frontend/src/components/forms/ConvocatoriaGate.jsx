import { Link } from "react-router-dom";
import ConvocatoriaBanner from "../ConvocatoriaBanner.jsx";
import { useConvocatoriaEstado } from "../../hooks/useConvocatoriaEstado.js";

// Public forms are shown only while a convocatoria is open (D.1): visitors
// learn it is closed before filling anything in. If the status cannot be
// checked the form stays available; the backend refuses a closed period anyway.
const ConvocatoriaGate = ({ children, quien }) => {
  const estado = useConvocatoriaEstado();
  const cerrado = estado.status === "ready" && !estado.data.abierta;
  return (
    <>
      <ConvocatoriaBanner estado={estado} className="mb-6" />
      {estado.status === "loading" ? null : cerrado ? (
        <div className="form-card text-center">
          <p className="m-0 font-semibold text-charcoal-950">Ahora no se pueden presentar solicitudes de {quien}.</p>
          <p className="mx-auto mb-0 mt-2 max-w-xl text-sm leading-6 text-muted">
            El formulario se abrirá cuando empiece la próxima convocatoria. Si ya participas, puedes consultar tu
            situación en el portal.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to="/login" className="btn btn-primary">
              Acceder al portal
            </Link>
            <Link to="/" className="btn btn-secondary">
              Volver al inicio
            </Link>
          </div>
        </div>
      ) : (
        children
      )}
    </>
  );
};

export default ConvocatoriaGate;
