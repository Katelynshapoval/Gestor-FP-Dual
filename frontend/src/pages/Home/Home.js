import { Link, Navigate } from "react-router-dom";
import { FaArrowRightLong, FaBuilding, FaRightToBracket, FaUserGraduate } from "react-icons/fa6";
import { useUser } from "../../context/UserContext";
import { homeForRole } from "../../navigation.js";
import { useConvocatoriaEstado } from "../../hooks/useConvocatoriaEstado.js";
import ConvocatoriaBanner from "../../components/ConvocatoriaBanner.jsx";

// Public landing page. Signed-in users go straight to their own home (staff:
// Panel; companies and students: their portal).
const CARDS = [
  {
    to: "/addDualStudent",
    Icon: FaUserGraduate,
    title: "Soy alumno o alumna",
    desc: "Presenta tu candidatura al programa FP Dual: datos personales, ciclo, CV y Anexo DGA.",
    cta: "Presentar candidatura",
  },
  {
    to: "/addCompanyRequest",
    Icon: FaBuilding,
    title: "Soy una empresa",
    desc: "Registra tu empresa, indica los ciclos y plazas que ofreces y recibe el convenio.",
    cta: "Solicitar plazas",
  },
];

function Home() {
  const { user } = useUser();
  const estado = useConvocatoriaEstado();
  if (user) return <Navigate to={homeForRole(user.rol)} replace />;

  const cerrado = estado.status === "ready" && !estado.data.abierta;

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-surface-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 md:px-8">
          <div className="page-kicker">Centro Salesiano Ntra. Sra. del Pilar</div>
          <h1 className="max-w-3xl break-words font-display text-3xl font-semibold leading-tight text-charcoal-950 md:text-4xl">
            Formación Profesional Dual
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            Solicitudes de alumnos y empresas, reservas de plazas y documentación del programa, en un solo lugar.
          </p>
          <ConvocatoriaBanner estado={estado} className="mt-6 max-w-3xl" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 md:px-8">
        <h2 className="form-section-title">Presentar una solicitud</h2>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CARDS.map((c) => (
            <li key={c.to}>
              <Link
                to={c.to}
                className="group flex h-full min-w-0 flex-col rounded-xl2 border border-surface-200 bg-white p-6 shadow-card outline-none transition-[border-color,box-shadow] duration-150 ease-out hover:border-brand-200 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-brand-500/30"
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-700">
                  <c.Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="mb-2 font-display text-lg font-semibold text-charcoal-950">{c.title}</span>
                <span className="mb-5 text-sm leading-6 text-muted">{c.desc}</span>
                <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
                  {cerrado ? "Ver el formulario (plazo cerrado)" : c.cta}
                  <FaArrowRightLong aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-1 motion-reduce:transition-none" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-3 rounded-xl2 border border-surface-200 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="m-0 font-semibold text-charcoal-950">¿Ya has presentado tu solicitud?</p>
            <p className="m-0 mt-1 text-sm text-muted">
              Accede con tu DNI/NIE (alumnos) o tu CIF (empresas) para consultar el estado y tus documentos.
            </p>
          </div>
          <Link to="/login" className="btn btn-primary shrink-0">
            <FaRightToBracket aria-hidden="true" /> Acceder
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Home;
