import { Link } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import "./Home.css";
import {
  FaArrowRightLong,
  FaBuilding,
  FaFileSignature,
  FaLink,
  FaUserGraduate,
} from "react-icons/fa6";

function Home() {
  const { user } = useUser();

  const isAdmin = user?.rol === "ADMINISTRADOR" || user?.rol === "COORDINADOR";
  const isEmpresa = user?.rol === "EMPRESA";

  const cards = [
    ...(!user || isAdmin
      ? [
          {
            to: "/addDualStudent",
            Icon: FaUserGraduate,
            title: "Presentar candidatura",
            desc: "Rellena el formulario de inscripción para el programa FP Dual.",
          },
          {
            to: "/addCompanyRequest",
            Icon: FaBuilding,
            title: "Solicitud de empresa",
            desc: "Registra tu empresa y solicita plazas para estudiantes en prácticas.",
          },
        ]
      : []),
    ...(isEmpresa
      ? [
          {
            to: "/companyMain",
            Icon: FaBuilding,
            title: "Panel de empresa",
            desc: "Consulta la información de tu empresa y gestiona los alumnos que has reservado.",
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            to: "/companiesView",
            Icon: FaFileSignature,
            title: "Empresas colaboradoras",
            desc: "Administra las empresas registradas en Dual: consulta datos, gestiona anexos.",
          },
        ]
      : []),
    ...(user
      ? [
          {
            to: "/linkStudents",
            Icon: FaLink,
            title: "Vincular alumnos",
            desc: "Gestiona las asignaciones de alumnos a empresas colaboradoras.",
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-surface-200 bg-white">
        <div className="home-content mx-auto grid gap-6 px-4 py-10 sm:px-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div className="min-w-0">
            <div className="page-kicker">Plataforma del centro</div>
            <h1 className="home-title max-w-full break-words font-display text-3xl font-semibold leading-tight text-charcoal-950 md:text-4xl">
              Gestor de FP Dual del Centro Salesiano Ntra. Sra. del Pilar
            </h1>

            <p className="home-copy mt-4 max-w-full break-words text-base leading-7 text-muted">
              Gestión integral del programa de Formación Profesional Dual
            </p>
          </div>
        </div>
      </div>

      <div className="home-content mx-auto px-4 py-8 sm:px-6 md:px-8">
        <div className="mb-8">
          <h2 className="mb-1 text-lg font-semibold text-charcoal-950">
            Módulos principales
          </h2>
          <p className="text-sm text-muted">
            Accede a las funcionalidades principales del sistema
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="group flex min-h-[14rem] min-w-0 flex-col rounded-xl2 border border-surface-200 bg-white p-5 shadow-card outline-none transition-[border-color,box-shadow] duration-150 ease-out hover:border-brand-200 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-brand-500/25"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-700">
                <c.Icon className="h-4 w-4" />
              </div>

              <h3 className="mb-2 font-display text-lg font-semibold text-charcoal-950">
                {c.title}
              </h3>

              <p className="home-copy mb-4 max-w-full break-words text-sm leading-6 text-muted">
                {c.desc}
              </p>

              <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-brand-700">
                Acceder al módulo
                <FaArrowRightLong className="ml-2 transition-transform duration-150 group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Home;
