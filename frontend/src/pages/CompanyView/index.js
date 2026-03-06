import { useEffect, useState } from "react";
import { useUser } from "../../globales/User";
import { useNavigate } from "react-router-dom";
import { buildPostOptions } from "../../utils/api.js";

import Dropdown from "./Dropdown.jsx";
import CompanyInfo from "./CompanyInfo.jsx";
import AssignedStudents from "./AssignedStudents.jsx";

import "../../shared_styles/forms.css";

// PÁGINA: Panel de empresa. Muestra los datos de la solicitud y los alumnos asignados.
const CompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  const [companyData, setCompanyData] = useState(null);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [specialities, setSpecialities] = useState([]);
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || user.user_type !== "empresa") {
      navigate("/login");
      return;
    }

    const fetchAll = async () => {
      try {
        const [companyRes, specRes, transRes, studentsRes] = await Promise.all([
          fetch(
            "/getCompanyDataByEmail",
            buildPostOptions({ email: user.email }),
          ),
          fetch("/getAllSpecialities"),
          fetch("/getAllPossibleTransports"),
        ]);

        if (companyRes.ok) setCompanyData(await companyRes.json());
        if (specRes.ok) setSpecialities(await specRes.json());
        if (transRes.ok) setTransports(await transRes.json());

        // TODO: implementar lógica de reservas
      } catch (err) {
        console.error("Error al cargar datos:", err);
        setError("Error al cargar los datos. Inténtalo de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [user, navigate]);

  if (loading)
    return (
      <div className="page-container px-8">
        <p className="text-center text-gray-500 py-12">Cargando datos…</p>
      </div>
    );

  if (error)
    return (
      <div className="page-container px-8">
        <p className="text-center text-red-500 py-12">{error}</p>
      </div>
    );

  return (
    <div className="page-container px-8">
      <h1 className="page-title">Panel de empresa</h1>
      <p className="page-subtitle">
        Consulta la información de tu solicitud y los alumnos que tienes
        asignados.
      </p>

      <div className="space-y-6">
        <Dropdown
          title="Información de la empresa"
          subtitle={
            companyData
              ? `${companyData.razonSocial} · ${companyData.cif}`
              : "Sin datos"
          }
          defaultOpen
        >
          <CompanyInfo
            companyData={companyData}
            specialities={specialities}
            transports={transports}
          />
        </Dropdown>

        <Dropdown
          title="Alumnos asignados"
          subtitle={`${assignedStudents.length} alumno${assignedStudents.length !== 1 ? "s" : ""}`}
        >
          <AssignedStudents
            students={assignedStudents}
            userName={user.nombre}
          />
        </Dropdown>
      </div>
    </div>
  );
};

export default CompanyView;
