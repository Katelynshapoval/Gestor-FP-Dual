import { useEffect, useState } from "react";
import { MdContactMail, MdDirectionsCar, MdPersonOutline, MdSchool } from "react-icons/md";
import { publicJSON } from "../../utils/api.js";
import { RadioField, SelectField, TextField } from "../../components/forms/StepForm.jsx";
import { EditGrid, EditSection, LockedField, W, focusFirstError } from "../../components/forms/EditDialog.jsx";

// Student data form, shown inside EditDialog like CompanyEditForm: Administración
// edits directly (AlumnoDatosActions) and the student sends it for review (MisDatos).
// The DNI/NIE is shown read-only: it is never editable. A new ciclo clears the
// preferences, which belong to a ciclo.

export const ALUMNO_SECTIONS = [
  { id: "alu-ciclo", label: "Ciclo" },
  { id: "alu-personales", label: "Datos personales" },
  { id: "alu-contacto", label: "Contacto" },
  { id: "alu-otros", label: "Movilidad y otros" },
];

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
// Order on screen, to move to the first field with an error.
const ORDER = ["id_especialidad", "pref1", ...TEXT_FIELDS, ...BOOL_FIELDS];
// The preferences error is shown on the first preference.
const conPref = (e) => ({ ...e, pref1: e.preferencias });
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
  formId,
  onSubmit,
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

  // Server-side errors (after saving) also move to the first wrong field.
  useEffect(() => {
    if (Object.keys(errores).some((k) => errores[k])) focusFirstError(conPref(errores), ORDER);
  }, [errores]);

  const submit = (event) => {
    event.preventDefault();
    const e = requiredErrors(values);
    setFaltan(e);
    if (Object.keys(e).length) focusFirstError(conPref(e), ORDER);
    else onSubmit(payload(values));
  };

  return (
    <form id={formId} noValidate onSubmit={submit}>
      <EditSection
        id="alu-ciclo"
        icon={MdSchool}
        title="Ciclo y preferencias"
        description={cicloBloqueado ? undefined : "Al cambiar el ciclo se sustituyen las preferencias."}
      >
        <EditGrid>
          <SelectField
            {...field("id_especialidad")}
            required
            disabled={cicloBloqueado}
            options={cicloOptions}
            className={W.full}
          />
        </EditGrid>
        {cicloAviso}
        <EditGrid className="edit-grid-3 mt-4">
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
        </EditGrid>
      </EditSection>

      <EditSection id="alu-personales" icon={MdPersonOutline} title="Datos personales">
        <EditGrid>
          <TextField {...field("nombre")} maxLength={100} className={W.full} />
          <LockedField label="DNI / NIE" value={dni} hint="El DNI/NIE no se puede modificar." className={W.half} />
          <TextField {...field("fechaNacimiento")} type="date" className={W.half} />
          <TextField {...field("nacionalidad")} maxLength={50} className={W.half} />
          <SelectField
            {...field("sexo")}
            options={[
              { value: "Hombre", label: "Hombre" },
              { value: "Mujer", label: "Mujer" },
              ...(values.sexo && !["Hombre", "Mujer"].includes(values.sexo)
                ? [{ value: values.sexo, label: values.sexo }]
                : []),
            ]}
            className={W.half}
          />
          <TextField {...field("tutorLegal")} maxLength={100} className={W.half} />
          <TextField
            {...field("dniTutorLegal")}
            maxLength={15}
            onChange={(n, v) => set(n, v.toUpperCase())}
            className={W.half}
          />
        </EditGrid>
      </EditSection>

      <EditSection id="alu-contacto" icon={MdContactMail} title="Contacto" description="Dónde te escriben el centro y la empresa.">
        <EditGrid>
          <TextField {...field("email")} type="email" maxLength={100} className={W.half} />
          <TextField {...field("emailColegio")} type="email" maxLength={100} className={W.half} />
          <TextField {...field("telalumno")} type="tel" inputMode="numeric" maxLength={9} className={W.half} />
          <TextField {...field("telfamilia")} type="tel" maxLength={20} className={W.half} />
          <TextField {...field("domicilio")} maxLength={255} className={W.full} />
          <TextField {...field("cp")} inputMode="numeric" maxLength={5} className={W.half} />
          <TextField {...field("localidad")} maxLength={100} className={W.half} />
        </EditGrid>
      </EditSection>

      <EditSection id="alu-otros" icon={MdDirectionsCar} title="Movilidad y otros datos">
        <EditGrid>
          <RadioField {...field("carnetDeConducir")} options={SI_NO} variant="segmented" className={W.half} />
          <RadioField {...field("tieneCoche")} options={SI_NO} variant="segmented" className={W.half} />
          <TextField {...field("idiomasConocidos")} maxLength={255} placeholder="Ej.: Inglés B2" className={W.full} />
          <TextField {...field("numeroSS")} inputMode="numeric" maxLength={30} className={W.half} />
          <TextField {...field("situacionLaboral")} maxLength={30} className={W.half} />
        </EditGrid>
      </EditSection>
    </form>
  );
};

export default AlumnoEditForm;
