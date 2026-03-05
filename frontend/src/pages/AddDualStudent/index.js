import { useState, useEffect, useRef } from "react";
import * as FormatValidation from "../../functions/FormatValidation.js";
import { useFormMessage } from "../../hooks/useFormMessage.js";
import { postForm } from "../../utils/api.js";
import GenderField from "./GenderField.jsx";
import LegalGuardianFields from "./LegalGuardianFields.jsx";
import FormMessage from "../../components/ui/FormMessage.jsx";
import { MdOutlineFileUpload } from "react-icons/md";

import "../../shared_styles/forms.css";

function Field({ id, label, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function PreferenciaSelect({ label, value, onChange, dataPreferences }) {
  return (
    <Field label={label}>
      <select
        className="select-input"
        value={value}
        onChange={onChange}
        required
      >
        <option value="">Seleccione una preferencia</option>
        {dataPreferences.map((p) => (
          <option key={p.idPreferencia} value={p.idPreferencia}>
            {p.preferencia}
          </option>
        ))}
      </select>
    </Field>
  );
}

// PÁGINA para que los alumnos presenten su candidatura al programa de FP Dual.
function AddDualStudent() {
  const { message, showMessage } = useFormMessage();
  const formRef = useRef(null);
  const [dataSpecialities, setDataSpecialities] = useState([]);
  const [dataPreferences, setDataPreferences] = useState([]);
  const [esMenor, setEsMenor] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [dniNie, setDniNie] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [preference1, setPreference1] = useState("");
  const [preference2, setPreference2] = useState("");
  const [preference3, setPreference3] = useState("");
  const [studiesEmail, setStudiesEmail] = useState("");
  const [nationality, setNationality] = useState("");
  const [drivingLicense, setDrivingLicense] = useState("");
  const [availability, setAvailability] = useState("");
  const [SSnumber, setSSNumber] = useState("");
  const [legalGuardianName, setLegalGuardianName] = useState("");
  const [speciality, setSpeciality] = useState("");
  const [studentTelephone, setStudentTelephone] = useState("");
  const [legalGuardianDni, setLegalGuardianDni] = useState("");
  const [email, setEmail] = useState("");
  const [adress, setAdress] = useState("");
  const [cp, setCP] = useState("");
  const [location, setLocation] = useState("");
  const [idioms, setIdioms] = useState("");
  const [file, setFile] = useState(null);
  const [cv, setCv] = useState(null);

  useEffect(() => {
    fetch("/getAllSpecialities")
      .then((r) => r.json())
      .then(setDataSpecialities)
      .catch((err) => console.error("Error al cargar especialidades:", err));
  }, []);

  const handleSpecialityChange = (e) => {
    const id = e.target.value;
    setSpeciality(id);
    fetch("/getPreferencesBySpeciality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idSpeciality: id }),
    })
      .then((r) => r.json())
      .then(setDataPreferences)
      .catch((err) => console.error("Error al cargar preferencias:", err));
  };

  const handleBirthdateChange = (e) => {
    const birthDate = new Date(e.target.value);
    setEsMenor(
      birthDate >
        new Date(new Date().setFullYear(new Date().getFullYear() - 18)),
    );
    setBirthdate(e.target.value);
  };

  const handleSubmit = async () => {
    if (!formRef.current.checkValidity()) {
      formRef.current.reportValidity();
      return;
    }
    if (!FormatValidation.dniNieValido(dniNie)) {
      await showMessage("Formato de DNI/NIE del alumno no válido.");
      return;
    }
    if (!FormatValidation.nSSValido(SSnumber)) {
      await showMessage("Formato del número de Seguridad Social no válido.");
      return;
    }
    if (esMenor && !FormatValidation.dniNieValido(legalGuardianDni)) {
      await showMessage("Formato de DNI/NIE del tutor legal no válido.");
      return;
    }
    try {
      const data = new FormData();
      data.append("emailinstituto", studiesEmail);
      data.append("dniNie", dniNie);
      data.append("nombre", name);
      data.append("sexo", gender);
      data.append("fechanacimiento", birthdate);
      data.append("nacionalidad", nationality);
      data.append("email", email);
      data.append("telalumno", studentTelephone);
      data.append("carnetconducir", drivingLicense);
      data.append("disponibilidad", availability);
      data.append("idiomas", idioms);
      data.append("numeroSS", SSnumber);
      data.append("domicilio", adress);
      data.append("cp", cp);
      data.append("localidad", location);
      data.append("especialidad", speciality);
      data.append("idpreferencia1", preference1);
      data.append("idpreferencia2", preference2);
      data.append("idpreferencia3", preference3);
      data.append("nombretutorlegal", legalGuardianName);
      data.append("dnitutorlegal", legalGuardianDni);
      data.append("doc", file);
      data.append("cv", cv);
      await postForm("/addStudent", data);
      await showMessage("La candidatura se ha enviado correctamente.");
    } catch {
      await showMessage("Ha ocurrido un error. Inténtalo de nuevo.");
    }
  };

  return (
    <div className="page-container px-8">
      <h1 className="page-title">Presentar candidatura</h1>
      <p className="page-subtitle">
        Rellena todos los campos para inscribirte en el programa de FP Dual.
      </p>
      <form ref={formRef} className="space-y-6">
        <div className="form-card">
          <div className="form-section-title">Datos del centro</div>
          <Field id="studiesEmail" label="Email del instituto">
            <input
              id="studiesEmail"
              className="input"
              type="email"
              value={studiesEmail}
              onChange={(e) => setStudiesEmail(e.target.value)}
              pattern="^[a-zA-Z0-9._%+-]+@zaragoza\.salesianos\.edu$"
              placeholder="Introduce el email del instituto"
              maxLength={60}
              required
            />
          </Field>
          <Field label="Especialidad">
            <select
              className="select-input"
              value={speciality}
              onChange={handleSpecialityChange}
              required
            >
              <option value="">Seleccione una especialidad</option>
              {dataSpecialities.map((esp) => (
                <option key={esp.idEspecialidad} value={esp.idEspecialidad}>
                  {esp.nombreEsp}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <PreferenciaSelect
              label="Preferencia 1"
              value={preference1}
              onChange={(e) => setPreference1(e.target.value)}
              dataPreferences={dataPreferences}
            />
            <PreferenciaSelect
              label="Preferencia 1"
              value={preference1}
              onChange={(e) => setPreference1(e.target.value)}
              dataPreferences={dataPreferences}
            />
            <PreferenciaSelect
              label="Preferencia 1"
              value={preference1}
              onChange={(e) => setPreference1(e.target.value)}
              dataPreferences={dataPreferences}
            />
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">Datos personales</div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="dniNie" label="DNI / NIE">
              <input
                id="dniNie"
                className="input"
                value={dniNie}
                onChange={(e) => setDniNie(e.target.value)}
                pattern="[A-Z0-9]{9,10}"
                maxLength={10}
                placeholder="12345678A"
                required
              />
            </Field>
            <Field id="nameF" label="Nombre completo">
              <input
                id="nameF"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={45}
                placeholder="Introduce tu nombre y apellidos"
                required
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="birthdate" label="Fecha de nacimiento">
              <input
                id="birthdate"
                className="input"
                type="date"
                value={birthdate}
                onChange={handleBirthdateChange}
                required
              />
            </Field>
            <Field id="nationality" label="Nacionalidad">
              <input
                id="nationality"
                className="input"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                maxLength={20}
                placeholder="Tu nacionalidad"
                required
              />
            </Field>
          </div>
          <GenderField
            gender={gender}
            onChange={(e) => setGender(e.target.value)}
          />
          {esMenor && (
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-4">
              <p
                style={{
                  margin: "0 0 .75rem",
                  fontSize: ".8rem",
                  fontWeight: 600,
                  color: "var(--brand)",
                }}
              >
                ⚠ El alumno es menor de edad — datos del tutor legal
              </p>
              <LegalGuardianFields
                legalGuardianName={legalGuardianName}
                legalGuardianDni={legalGuardianDni}
                onNameChange={(e) => setLegalGuardianName(e.target.value)}
                onDniChange={(e) => setLegalGuardianDni(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="form-card">
          <div className="form-section-title">Contacto y domicilio</div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="email" label="Email personal">
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@gmail.com"
                maxLength={60}
                required
              />
            </Field>
            <Field id="tel" label="Teléfono">
              <input
                id="tel"
                className="input"
                value={studentTelephone}
                onChange={(e) => setStudentTelephone(e.target.value)}
                placeholder="Número de teléfono"
                pattern="[0-9]{9}"
                required
              />
            </Field>
          </div>
          <Field id="adress" label="Domicilio">
            <input
              id="adress"
              className="input"
              value={adress}
              onChange={(e) => setAdress(e.target.value)}
              placeholder="Calle, número, piso..."
              maxLength={50}
              required
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="cp" label="Código postal">
              <input
                id="cp"
                className="input"
                value={cp}
                onChange={(e) => setCP(e.target.value)}
                maxLength={5}
                placeholder="50001"
                required
              />
            </Field>
            <Field id="location" label="Localidad">
              <input
                id="location"
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Zaragoza"
                maxLength={40}
                required
              />
            </Field>
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">Movilidad y aptitudes</div>
          <Field label="Carnet de conducir">
            <div className="radio-group">
              {[
                { v: "true", l: "Sí" },
                { v: "false", l: "No" },
              ].map(({ v, l }) => (
                <label key={v} className="radio-option">
                  <input
                    type="radio"
                    name="dl"
                    value={v}
                    checked={drivingLicense === v}
                    onChange={(e) => setDrivingLicense(e.target.value)}
                    required={v === "true"}
                  />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Disponibilidad de vehículo">
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="avail"
                  value="true"
                  checked={availability === "true"}
                  onChange={(e) => setAvailability(e.target.value)}
                  required
                />
                <span>Tengo vehículo disponible para ir a trabajar</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="avail"
                  value="false"
                  checked={availability === "false"}
                  onChange={(e) => setAvailability(e.target.value)}
                />
                <span>No dispongo de vehículo</span>
              </label>
            </div>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="idioms" label="Idiomas (con nivel)">
              <input
                id="idioms"
                className="input"
                value={idioms}
                onChange={(e) => setIdioms(e.target.value)}
                placeholder="Inglés B2, Francés A2"
                required
                maxLength={15}
              />
            </Field>
            <Field id="ss" label="Nº Seguridad Social (si lo tienes)">
              <input
                id="ss"
                className="input"
                value={SSnumber}
                onChange={(e) => setSSNumber(e.target.value)}
                placeholder="28 00012345 63"
                pattern="[0-9]{12}"
                maxLength={12}
              />
            </Field>
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">Documentación</div>
          <Field label="Curriculum Vitae (PDF)">
            <label className="file-upload">
              <MdOutlineFileUpload className="file-upload-icon" />

              <span className="file-upload-text">Seleccionar archivo…</span>

              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setCv(e.target.files[0])}
                required
              />
            </label>
          </Field>
          <Field
            label={
              <>
                Anexo 2 firmado (
                <a
                  href="https://docs.google.com/forms/d/e/1FAIpQLSfnDOKn6jRMtjhdqJTh2FnHTu_sa-ZiuodFvTRvbT-gm082ow/viewform"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--brand)" }}
                >
                  descargar aquí
                </a>
                )
              </>
            }
          >
            <label className="file-upload">
              <MdOutlineFileUpload className="file-upload-icon" />

              <span className="file-upload-text">Seleccionar archivo...</span>

              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files[0])}
                required
              />
            </label>
          </Field>
        </div>

        <button
          type="button"
          className="btn btn-primary mt-2 mx-auto block"
          onClick={handleSubmit}
        >
          Presentar candidatura
        </button>
        <FormMessage message={message} />
      </form>
    </div>
  );
}

export default AddDualStudent;
