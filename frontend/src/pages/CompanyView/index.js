import { useEffect, useState, useRef } from "react";
import { useUser } from "../../globales/User";
import { useNavigate } from "react-router-dom";
import { buildPostOptions } from "../../utils/api.js";
import { ofuscarId } from "../../utils/idObfuscation.js";

import Dropdown from "./Dropdown.jsx";
import CompanyInfo from "./CompanyInfo.jsx";
import AssignedStudents from "./AssignedStudents.jsx";

import { FaFilePdf } from "react-icons/fa6";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions } from "react-icons/md";

import "../../shared_styles/forms.css";

// Este componente gestiona la subida del convenio firmado
const SubirConvenio = ({ companyData, onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const inputRef = useRef(null);

  if (!companyData) return null;

  const idOfuscado = ofuscarId(companyData.idAuxEmpresa);

  // Maneja la selección de archivo
  const handleFileChange = (e) => {
    const selected = e.target.files[0];

    if (selected && selected.type !== "application/pdf") {
      setUploadMsg({ ok: false, text: "Solo se admiten archivos PDF." });
      setFile(null);
      return;
    }

    setFile(selected);
    setUploadMsg(null);
  };

  // Maneja la subida del archivo
  const handleUpload = async () => {
    if (!file) {
      setUploadMsg({
        ok: false,
        text: "Selecciona un archivo PDF primero.",
      });
      return;
    }

    setUploading(true);
    setUploadMsg(null);

    try {
      const formData = new FormData();
      formData.append("convenio", file);

      const res = await fetch(`/updateConvenio/${idOfuscado}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Error al subir el convenio");

      setUploadMsg({
        ok: true,
        text: "Convenio subido correctamente. Está pendiente de validación por el administrador.",
      });

      setFile(null);
      if (inputRef.current) inputRef.current.value = "";

      onUploadSuccess();
    } catch (err) {
      setUploadMsg({ ok: false, text: err.message });
    } finally {
      setUploading(false);
    }
  };

  // Determina el estado del convenio
  const convenioStatus = companyData.convenio_validado
    ? "validado"
    : companyData.tieneConvenio
      ? "pendiente"
      : "sin_convenio";

  return (
    <div className="space-y-4">
      {/* Estado actual del convenio */}
      <div
        className={`p-4 rounded-lg border flex items-start gap-3 ${
          convenioStatus === "validado"
            ? "border-green-200 bg-green-50 text-green-800"
            : convenioStatus === "pendiente"
              ? "border-yellow-200 bg-yellow-50 text-yellow-800"
              : "border-red-200 bg-red-50 text-red-800"
        }`}
      >
        {convenioStatus === "validado" && (
          <IoIosCheckmarkCircleOutline className="text-xl shrink-0 mt-0.5" />
        )}

        {convenioStatus === "pendiente" && (
          <MdPendingActions className="text-xl shrink-0 mt-0.5" />
        )}

        {convenioStatus === "sin_convenio" && (
          <MdOutlineCancel className="text-xl shrink-0 mt-0.5" />
        )}

        <p className="text-sm">
          {convenioStatus === "validado"
            ? "Tu convenio ha sido recibido y validado por el administrador. No es necesario volver a subirlo."
            : convenioStatus === "pendiente"
              ? "Tu convenio ha sido recibido y está pendiente de validación por el administrador. Puedes reemplazarlo si es necesario."
              : "Aún no has subido el convenio firmado. Por favor, descarga el convenio del correo que recibiste, fírmalo y súbelo aquí en formato PDF."}
        </p>
      </div>

      {/* Zona de subida */}
      {convenioStatus !== "validado" && (
        <div className="space-y-3">
          <label className="text-sm font-medium text-[var(--text)]">
            {convenioStatus === "pendiente"
              ? "Reemplazar convenio (PDF)"
              : "Subir convenio firmado (PDF)"}
          </label>

          <div className="flex flex-col sm:flex-row gap-2">
            <label
              className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed
              border-gray-300 cursor-pointer hover:border-red-400 hover:bg-red-50/40 transition-all duration-150 text-sm text-gray-600"
            >
              <FaFilePdf className="text-red-500 text-base shrink-0" />

              {file ? file.name : "Haz clic para seleccionar un PDF"}

              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                !file || uploading
                  ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                  : "bg-[var(--brand)] text-white border border-[var(--brand)] hover:bg-[var(--brand-dark)]"
              }`}
            >
              {uploading ? "Subiendo…" : "Subir convenio"}
            </button>
          </div>
        </div>
      )}

      {/* Mensaje de resultado */}
      {uploadMsg && (
        <p
          className={`text-sm px-4 py-2 rounded-lg ${
            uploadMsg.ok
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {uploadMsg.text}
        </p>
      )}
    </div>
  );
};

// Este es el panel principal de la empresa
const CompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  const [companyData, setCompanyData] = useState(null);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [specialities, setSpecialities] = useState([]);
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Refresca los datos de la empresa tras subir convenio
  const fetchCompanyData = async () => {
    const res = await fetch(
      "/getCompanyDataByEmail",
      buildPostOptions({ email: user.email }),
    );

    if (res.ok) {
      setCompanyData(await res.json());
    }
  };

  // Carga inicial de datos
  useEffect(() => {
    if (!user || user.user_type !== "empresa") {
      navigate("/login");
      return;
    }

    const fetchAll = async () => {
      try {
        const [companyRes, specRes, transRes] = await Promise.all([
          fetch(
            "/getCompanyDataByEmail",
            buildPostOptions({ email: user.email }),
          ),
          fetch("/getAllSpecialities"),
          fetch("/getAllPossibleTransports"),
        ]);

        if (companyRes.ok) {
          setCompanyData(await companyRes.json());
        }

        if (specRes.ok) {
          setSpecialities(await specRes.json());
        }

        if (transRes.ok) {
          setTransports(await transRes.json());
        }
      } catch (err) {
        console.error("Error al cargar datos:", err);
        setError("Error al cargar los datos. Inténtalo de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [user, navigate]);

  // Estado de carga
  if (loading) {
    return (
      <div className="page-container px-8">
        <p className="text-center text-gray-500 py-12">Cargando datos…</p>
      </div>
    );
  }

  // Estado de error
  if (error) {
    return (
      <div className="page-container px-8">
        <p className="text-center text-red-500 py-12">{error}</p>
      </div>
    );
  }

  return (
    <div className="page-container px-8">
      <h1 className="page-title">Panel de empresa</h1>

      <p className="page-subtitle">
        Consulta la información de tu solicitud, sube el convenio firmado y
        revisa los alumnos asignados.
      </p>

      <div className="space-y-6">
        {/* Información de la empresa */}
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

        {/* Convenio firmado */}
        <Dropdown
          title="Convenio firmado"
          subtitle={
            companyData?.convenio_validado ? (
              <div className="flex items-center gap-2">
                <IoIosCheckmarkCircleOutline className="text-xl" />
                Validado
              </div>
            ) : companyData?.tieneConvenio ? (
              <div className="flex items-center gap-2">
                <MdPendingActions className="text-xl" />
                Pendiente de validación
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <MdOutlineCancel className="text-xl" />
                Sin subir
              </div>
            )
          }
          defaultOpen={!companyData?.convenio_validado}
        >
          <SubirConvenio
            companyData={companyData}
            onUploadSuccess={fetchCompanyData}
          />
        </Dropdown>

        {/* Alumnos asignados */}
        <Dropdown
          title="Alumnos asignados"
          subtitle={`${assignedStudents.length} alumno${
            assignedStudents.length !== 1 ? "s" : ""
          }`}
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
