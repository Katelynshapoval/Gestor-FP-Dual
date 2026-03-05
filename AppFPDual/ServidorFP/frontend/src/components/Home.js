import { Link } from 'react-router-dom';
import { useUser } from '../globales/User';

// PÁGINA de bienvenida con hero y accesos rápidos.
function Home() {
  const { user } = useUser();

  const cards = [
    { to: '/addDualStudent', icon: '🎓', title: 'Presentar candidatura', desc: 'Rellena el formulario de inscripción para el programa FP Dual.' },
    { to: '/addCompanyRequest', icon: '🏢', title: 'Solicitud de empresa', desc: 'Registra tu empresa y solicita plazas para estudiantes en prácticas.' },
    ...(user ? [{ to: '/linkStudents', icon: '🔗', title: 'Vincular alumnos', desc: 'Gestiona las asignaciones de alumnos a empresas colaboradoras.' }] : []),
  ];

  return (
    <div className="home-page">
      <div className="home-hero">
        <h1>Gestor de FP Dual del Centro Salesiano Ntra. Sra. del Pilar</h1>
        <p>Gestión integral del programa de Formación Profesional Dual</p>
      </div>
      <div className="home-body">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="home-card">
            <div className="home-card-icon">{c.icon}</div>
            <h3>{c.title}</h3>
            <p>{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Home;
