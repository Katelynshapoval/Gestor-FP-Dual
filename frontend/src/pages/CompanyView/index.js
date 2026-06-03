import { useEffect, useState, useRef } from "react";
import { useUser } from "../../globales/User";
import { useNavigate } from "react-router-dom";
import { buildPostOptions, postForm } from "../../utils/api.js";
import { ofuscarId } from "../../utils/idObfuscation.js";
import * as FormatValidation from "../../functions/FormatValidation.js";

import Dropdown from "./Dropdown.jsx";
import CompanyInfo from "./CompanyInfo.jsx";
import AssignedStudents from "./AssignedStudents.jsx";
import SpecialitySelector from "../AddCompanyRequest/SpecialitySelector.jsx";
import TransportSelector from "../AddCompanyRequest/TransportSelector.jsx";

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

// ------------------------------------------------------------
// Formulario de reaplicación al programa
// ------------------------------------------------------------
const ReapplyForm = ({ companyData, specialities, transports, onSuccess }) => {
  // Parsear especialidades existentes
  const parseExistingSpecialities = () => {
    if (!companyData?.especialidadYCantAlumnos) return [[], []];
    try {
      const parsed = JSON.parse(companyData.especialidadYCantAlumnos);
      return [parsed[0] || [], parsed[1] || []];
    } catch {
      return [[], []];
    }
  };

  // Parsear transportes existentes — siempre devuelve un array de números
  const parseExistingTransports = () => {
    if (!companyData?.metodosTransporte) return [];
    try {
      const raw = companyData.metodosTransporte;
      let ids;
      if (Array.isArray(raw)) {
        ids = raw;
      } else if (typeof raw === "string") {
        // Intentar JSON primero, caer en split por coma
        try {
          const parsed = JSON.parse(raw);
          ids = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          ids = raw.split(",");
        }
      } else {
        ids = [raw];
      }
      // Coerción a número y filtrado de NaN
      return ids.map((v) => Number(v)).filter((n) => !isNaN(n));
    } catch {
      return [];
    }
  };

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  // Campos editables — pre-rellenos con datos actuales
  const [emailCoordinador, setEmailCoordinador] = useState(
    companyData?.emailCoordinador || "",
  );
  const [nombreCoordinador, setNombreCoordinador] = useState(
    companyData?.nombreCoordinador || "",
  );
  const [telefonoCoordinador, setTelefonoCoordinador] = useState(
    companyData?.telefonoCoordinador || "",
  );
  const [descripcionPuesto, setDescripcionPuesto] = useState(
    companyData?.descripcionPuesto || "",
  );
  const [direccionLugarTrabajo, setDireccionLugarTrabajo] = useState(
    companyData?.direccionLugarTrabajo || "",
  );
  const [selectedSpecialities, setSelectedSpecialities] = useState(
    parseExistingSpecialities,
  );
  const [selectedTransports, setSelectedTransports] = useState(
    parseExistingTransports,
  );

  const handleSpecialityToggle = (id) => {
    setSelectedSpecialities(([ids, amounts]) => {
      const idx = ids.indexOf(id);
      if (idx === -1) return [[...ids, id], [...amounts, 1]];
      return [ids.filter((_, i) => i !== idx), amounts.filter((_, i) => i !== idx)];
    });
  };

  const handleAmountChange = (id, newCount) => {
    setSelectedSpecialities(([ids, amounts]) => {
      const idx = ids.indexOf(id);
      if (idx === -1) return [ids, amounts];
      const newAmounts = [...amounts];
      newAmounts[idx] = newCount;
      return [ids, newAmounts];
    });
  };

  const handleTransportToggle = (id) => {
    const numId = Number(id);
    setSelectedTransports((prev) =>
      prev.includes(numId) ? prev.filter((t) => t !== numId) : [...prev, numId],
    );
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (selectedSpecialities[0].length === 0) {
      setMsg({ ok: false, text: "Selecciona al menos un ciclo de grado." });
      return;
    }
    if (selectedSpecialities[1].some((c) => c <= 0)) {
      setMsg({ ok: false, text: "Indica al menos un alumno por grado." });
      return;
    }

    setSubmitting(true);
    setMsg(null);

    try {
      const data = new FormData();
      [
        ["emailCoordinador", emailCoordinador],
        ["nombreCoordinador", nombreCoordinador],
        ["telefonoCoordinador", telefonoCoordinador],
        ["razonSocial", companyData.razonSocial],
        ["cif", companyData.cif],
        ["telEmpresa", companyData.telEmpresa],
        ["dirRazSocial", companyData.dirRazSocial],
        ["provincia", companyData.provincia],
        ["municipio", companyData.municipio],
        ["cpRazSoc", companyData.cpRazSoc],
        ["responsableLegal", companyData.responsableLegal],
        ["cargo", companyData.cargo],
        ["dniRl", companyData.dniRl],
        ["descripcionPuesto", descripcionPuesto],
        ["direccionLugarTrabajo", direccionLugarTrabajo],
        ["metodosTransporte", JSON.stringify(selectedTransports)],
        ["fechaPeticion", FormatValidation.validDate(new Date())],
        ["specialities", JSON.stringify(selectedSpecialities)],
        ["url", window.location.origin],
      ].forEach(([k, v]) => data.append(k, v));

      const res = await fetch("/reapplyCompanyRequest", { method: "POST", body: data });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setMsg({ ok: false, text: json.error || "Ya existe una solicitud para el curso actual." });
        return;
      }

      if (!res.ok) throw new Error(json.error || "Error desconocido");

      setMsg({
        ok: true,
        text: "Reaplicación enviada correctamente. Recibirás un correo con el nuevo convenio.",
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Error al enviar la reaplicación. Inténtalo de nuevo." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Puedes modificar los datos que quieras actualizar para esta convocatoria.
        Los datos de la empresa (razón social, CIF, dirección…) se mantienen igual.
        Recibirás un nuevo convenio por correo al enviar.
      </p>

      {/* Coordinador */}
      <div className="form-card">
        <div className="form-section-title">Datos del coordinador</div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="field">
            <label htmlFor="re-eCoord">Email coordinador</label>
            <input
              id="re-eCoord"
              className="input"
              type="email"
              value={emailCoordinador}
              onChange={(e) => setEmailCoordinador(e.target.value)}
              maxLength={60}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="re-nCoord">Nombre coordinador</label>
            <input
              id="re-nCoord"
              className="input"
              value={nombreCoordinador}
              onChange={(e) => setNombreCoordinador(e.target.value)}
              maxLength={45}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="re-tCoord">Teléfono coordinador</label>
            <input
              id="re-tCoord"
              className="input"
              value={telefonoCoordinador}
              onChange={(e) => setTelefonoCoordinador(e.target.value)}
              maxLength={9}
              required
            />
          </div>
        </div>
      </div>

      {/* Puesto de trabajo */}
      <div className="form-card">
        <div className="form-section-title">Puesto de trabajo</div>
        <div className="space-y-6">
          <div className="field">
            <label htmlFor="re-desc">Descripción del puesto</label>
            <p className="field-hint">
              Indica las tareas que se le asignarán al estudiante.
            </p>
            <textarea
              id="re-desc"
              className="textarea"
              value={descripcionPuesto}
              onChange={(e) => setDescripcionPuesto(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="field">
            <label htmlFor="re-dir">Dirección del lugar de trabajo</label>
            <input
              id="re-dir"
              className="input"
              value={direccionLugarTrabajo}
              onChange={(e) => setDireccionLugarTrabajo(e.target.value)}
              maxLength={100}
            />
          </div>

          <SpecialitySelector
            dataSpecialities={specialities}
            specialities={selectedSpecialities}
            onToggle={handleSpecialityToggle}
            onAmountChange={handleAmountChange}
          />

          <TransportSelector
            dataTransports={transports}
            metodosTransporte={selectedTransports}
            onToggle={handleTransportToggle}
          />
        </div>
      </div>

      <button
        type="button"
        className={`btn btn-primary mt-2 mx-auto block ${submitting ? "btn-disabled" : ""}`}
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? "Enviando…" : "Enviar reaplicación"}
      </button>

      {msg && (
        <p
          className={`text-sm px-4 py-2 rounded-lg text-center ${
            msg.ok
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
};

// ------------------------------------------------------------
// Panel principal de la empresa
// ------------------------------------------------------------
const CompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  const [companyData, setCompanyData] = useState(null);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [specialities, setSpecialities] = useState([]);
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reapplied, setReapplied] = useState(false);

  // Refresca los datos de la empresa tras subir convenio o reaplicar
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

        {/* Reaplicar al programa */}
        <Dropdown
          title="Participar en la nueva convocatoria"
          subtitle="Envía una nueva solicitud para el próximo curso"
        >
          {reapplied ? (
            <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              Tu reaplicación ha sido enviada. Recibirás un correo con el nuevo
              convenio en breve.
            </p>
          ) : (
            <ReapplyForm
              companyData={companyData}
              specialities={specialities}
              transports={transports}
              onSuccess={() => {
                setReapplied(true);
                fetchCompanyData();
              }}
            />
          )}
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
