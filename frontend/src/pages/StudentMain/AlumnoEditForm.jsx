import { useEffect, useState } from "react";
import { publicJSON } from "../../utils/api.js";
import ReadField from "../../components/ui/ReadField.jsx";
import { RadioField, SelectField, TextField } from "../../components/forms/StepForm.jsx";

// Student data form, shared like CompanyEditForm: Administración edits directly
// (AlumnoDatosActions) and the student sends it for review (MisDatos).
// The DNI/NIE is shown read-only: it is never editable. A new ciclo clears the
// preferences, which belong to a ciclo.

export const LABELS = {
  id_especialidad: "Ciclo",
  nombre: "Nombre y apellidos",
  fechaNacimiento: "Fecha de nacimiento",
  nacionalidad: "Nacionalidad",
  sexo: "Sexo",
  tutorLegal: "Tutor legal",
  dniTutorLegal: "DNI/NIE del tutor legal",
  email: "Email personal",
  emailColegio: "Email del centro",
  telalumno: "Teléfono",
  telfamilia: "Teléfono familiar",
  domicilio: "Domicilio",
  cp: "Código postal",
  localidad: "Localidad",
  carnetDeConducir: "Carnet de conducir",
  tieneCoche: "Vehículo",
  idiomasConocidos: "Idiomas",
  numeroSS: "Nº de la Seguridad Social",
  situacionLaboral: "Situación laboral",
};

const TEXT_FIELDS = [
  "nombre", "fechaNacimiento", "nacionalidad", "sexo", "tutorLegal", "dniTutorLegal",
  "email", "emailColegio", "telalumno", "telfamilia", "domicilio", "cp", "localidad",
  "idiomasConocidos", "numeroSS", "situacionLaboral",
];
const BOOL_FIELDS = ["carnetDeConducir", "tieneCoche"];
const REQUIRED = ["nombre", "email", "telalumno", "domicilio", "cp", "localidad"];
const SI_NO = [
  { value: "true", label: "Sí" },
  { value: "false", label: "No" },
];

export function datosToAlumnoForm(datos = {}) {
  const form = {};
  for (const k of TEXT_FIELDS) form[k] = datos[k] ?? "";
  for (const k of BOOL_FIELDS) form[k] = datos[k] == null ? "" : String(Boolean(datos[k]));
  form.id_especialidad = datos.id_especialidad ? String(datos.id_especialidad) : "";
  const prefs = datos.preferencias || [];
  form.pref1 = prefs[0] ? String(prefs[0]) : "";
  form.pref2 = prefs[1] ? String(prefs[1]) : "";
  form.pref3 = prefs[2] ? String(prefs[2]) : "";
  return form;
}

// Current data with a pending request's values on top (the student edits it in place).
export function applyPropuesta(datos, propuesta) {
  return datosToAlumnoForm({ ...datos, ...(propuesta || {}) });
}

function payload(form) {
  const body = {};
  for (const k of TEXT_FIELDS) body[k] = form[k].trim();
  for (const k of BOOL_FIELDS) body[k] = form[k] === "" ? null : form[k] === "true";
  if (form.id_especialidad) body.id_especialidad = Number(form.id_especialidad);
  body.preferencias = [...new Set([form.pref1, form.pref2, form.pref3].filter(Boolean).map(Number))];
  return body;
}

function requiredErrors(form) {
  const errores = {};
  for (const k of REQUIRED) if (!String(form[k]).trim()) errores[k] = "Este campo es obligatorio.";
  if (!form.id_especialidad) errores.id_especialidad = "Elige un ciclo.";
  return errores;
}

const AlumnoEditForm = ({
  values,
  onChange,
  inicial,
  dni,
  errores = {},
  cicloBloqueado = false,
  cicloAviso = null,
  cicloActualNombre,
  submitting = false,
  submitLabel,
  onSubmit,
  onCancel,
}) => {
  const [especialidades, setEspecialidades] = useState([]);
  const [preferencias, setPreferencias] = useState({});
  const [faltan, setFaltan] = useState({});
  const errors = { ...faltan, ...errores };

  useEffect(() => {
    let active = true;
    publicJSON("/especialidades")
      .then((list) => active && setEspecialidades(Array.isArray(list) ? list : []))
      .catch(() => active && setEspecialidades([]));
    return () => {
      active = false;
    };
  }, []);

  const idCiclo = values.id_especialidad;
  useEffect(() => {
    if (!idCiclo || preferencias[idCiclo]) return undefined;
    let active = true;
    publicJSON(`/preferencias?id_especialidad=${idCiclo}`)
      .then((list) => active && setPreferencias((p) => ({ ...p, [idCiclo]: Array.isArray(list) ? list : [] })))
      .catch(() => active && setPreferencias((p) => ({ ...p, [idCiclo]: [] })));
    return () => {
      active = false;
    };
  }, [idCiclo, preferencias]);

  const set = (name, value) => {
    const next = { ...values, [name]: value };
    if (name === "id_especialidad" && value !== values.id_especialidad) {
      // Going back to the original ciclo restores its preferences.
      const vuelta = inicial && value === inicial.id_especialidad;
      next.pref1 = vuelta ? inicial.pref1 : "";
      next.pref2 = vuelta ? inicial.pref2 : "";
      next.pref3 = vuelta ? inicial.pref3 : "";
    }
    onChange(next);
    if (faltan[name]) setFaltan((f) => ({ ...f, [name]: undefined }));
  };

  // The current ciclo stays selectable even if it has since been deactivated.
  const cicloOptions = especialidades.map((e) => ({
    value: String(e.id_especialidad),
    label: e.turno && e.turno !== "DIURNO" ? `${e.nombre} · ${e.turno}` : e.nombre,
  }));
  if (inicial?.id_especialidad && !cicloOptions.some((o) => o.value === inicial.id_especialidad)) {
    cicloOptions.unshift({ value: inicial.id_especialidad, label: cicloActualNombre || "Ciclo actual" });
  }
  const prefOptions = (preferencias[idCiclo] || []).map((p) => ({ value: String(p.id_preferencia), label: p.descripcion }));

  const field = (name) => ({
    name,
    label: LABELS[name],
    value: values[name],
    onChange: set,
    error: errors[name],
    required: REQUIRED.includes(name),
  });

  const submit = () => {
    const e = requiredErrors(values);
    setFaltan(e);
    if (!Object.keys(e).length) onSubmit(payload(values));
  };

  return (
    <div className="space-y-6">
      <div className="form-card">
        <h2 className="form-section-title">Ciclo</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            {...field("id_especialidad")}
            required
            disabled={cicloBloqueado}
            options={cicloOptions}
            hint={cicloBloqueado ? undefined : "Al cambiar el ciclo se sustituyen las preferencias."}
          />
        </div>
        {cicloAviso}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {["pref1", "pref2", "pref3"].map((p, i) => (
            <SelectField
              key={p}
              name={p}
              label={`Preferencia ${i + 1}`}
              value={values[p]}
              onChange={set}
              options={prefOptions}
              placeholder="Sin preferencia"
              error={i === 0 ? errors.preferencias : undefined}
            />
          ))}
        </div>
      </div>

      <div className="form-card">
        <h2 className="form-section-title">Datos personales</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ReadField label="DNI / NIE" value={dni} />
          <TextField {...field("nombre")} maxLength={100} />
          <TextField {...field("fechaNacimiento")} type="date" />
          <TextField {...field("nacionalidad")} maxLength={50} />
          <SelectField
            {...field("sexo")}
            options={[
              { value: "Hombre", label: "Hombre" },
              { value: "Mujer", label: "Mujer" },
              ...(values.sexo && !["Hombre", "Mujer"].includes(values.sexo)
                ? [{ value: values.sexo, label: values.sexo }]
                : []),
            ]}
          />
          <TextField {...field("tutorLegal")} maxLength={100} />
          <TextField {...field("dniTutorLegal")} maxLength={15} onChange={(n, v) => set(n, v.toUpperCase())} />
        </div>
        <p className="field-hint mb-0 mt-2">El DNI/NIE no se puede modificar.</p>
      </div>

      <div className="form-card">
        <h2 className="form-section-title">Contacto</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField {...field("email")} type="email" maxLength={100} />
          <TextField {...field("emailColegio")} type="email" maxLength={100} />
          <TextField {...field("telalumno")} type="tel" inputMode="numeric" maxLength={9} />
          <TextField {...field("telfamilia")} type="tel" maxLength={20} />
          <TextField {...field("domicilio")} maxLength={255} className="md:col-span-2" />
          <TextField {...field("cp")} inputMode="numeric" maxLength={5} />
          <TextField {...field("localidad")} maxLength={100} />
        </div>
      </div>

      <div className="form-card">
        <h2 className="form-section-title">Movilidad y otros datos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <RadioField {...field("carnetDeConducir")} options={SI_NO} />
          <RadioField {...field("tieneCoche")} options={SI_NO} />
          <TextField {...field("idiomasConocidos")} maxLength={255} />
          <TextField {...field("numeroSS")} inputMode="numeric" maxLength={30} />
          <TextField {...field("situacionLaboral")} maxLength={30} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
        )}
        <button
          type="button"
          className={`btn btn-primary ${submitting ? "btn-disabled" : ""}`}
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? "Enviando…" : submitLabel}
        </button>
      </div>
    </div>
  );
};

export default AlumnoEditForm;
