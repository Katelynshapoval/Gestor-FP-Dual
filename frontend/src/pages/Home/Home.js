import { Link } from "react-router-dom";
import { useUser } from "../../globales/User";
import "./Home.css";
import { FaArrowRightLong } from "react-icons/fa6";

function Home() {
  const { user } = useUser();

  const cards = [
    ...(user?.user_type == "admin" || !user
      ? [
          {
            to: "/addDualStudent",
            icon: "🎓",
            title: "Presentar candidatura",
            desc: "Rellena el formulario de inscripción para el programa FP Dual.",
          },
          {
            to: "/addCompanyRequest",
            icon: "🏢",
            title: "Solicitud de empresa",
            desc: "Registra tu empresa y solicita plazas para estudiantes en prácticas.",
          },
        ]
      : []),
    ...(user?.user_type == "empresa"
      ? [
          {
            to: "/companyMain",
            icon: "🏢",
            title: "Panel de empresa",
            desc: "Consulta la información de tu empresa y gestiona los alumnos que has reservado.",
          },
        ]
      : []),

    ...(user
      ? [
          {
            to: "/linkStudents",
            icon: "🔗",
            title: "Vincular alumnos",
            desc: "Gestiona las asignaciones de alumnos a empresas colaboradoras.",
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col flex-1  ">
      {/* HERO */}
      <div className="home-hero relative overflow-hidden bg-gradient-to-br from-brand-500 to-brand-700 text-white px-8 py-20">
        <div className="max-w-6xl mx-auto relative z-10">
          <h1 className="font-display text-[clamp(1.8rem,4vw,2.8rem)] font-bold mb-4 max-w-[640px]">
            Gestor de FP Dual del Centro Salesiano Ntra. Sra. del Pilar
          </h1>

          <p className="text-lg font-light opacity-90">
            Gestión integral del programa de Formación Profesional Dual
          </p>
        </div>
      </div>

      {/* MODULES SECTION */}
      <div className="max-w-7xl mx-auto px-9 md:px-8 py-12 w-full">
        {" "}
        {/* Section title */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-1">Módulos principales</h2>
          <p className="text-sm text-gray-500 text-base">
            Accede a las funcionalidades principales del sistema
          </p>
        </div>
        {/* Cards */}
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="group bg-white border border-surface-200 border-t-4 border-t-brand-500 rounded-xl2 p-7 shadow-card hover:shadow-card-hover transition flex flex-col"
            >
              <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center text-lg mb-4">
                {c.icon}
              </div>

              <h3 className="font-display text-lg font-semibold mb-2">
                {c.title}
              </h3>

              <p className="text-base text-gray-500 mb-4">{c.desc}</p>

              {/* CTA */}
              <span className="mt-auto text-sm font-semibold text-brand-500 flex items-center gap-1 text-base">
                Acceder al módulo
                <FaArrowRightLong className="transition-transform group-hover:translate-x-1  ml-2" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Home;
