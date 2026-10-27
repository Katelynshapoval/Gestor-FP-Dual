import { useEffect, useState } from "react";
import { dniNieValido, nSSValido } from "../../utils/formatValidation.js";
import { postForm, publicJSON } from "../../utils/api.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";
import ConvocatoriaGate from "../../components/forms/ConvocatoriaGate.jsx";
import SubmitSuccess from "../../components/forms/SubmitSuccess.jsx";
import {
  ErrorSummary,
  FileField,
  RadioField,
  ReviewSection,
  SelectField,
  StepHeading,
  StepNav,
  Stepper,
  SubmitProgress,
  TextField,
  useStepForm,
  useUnsavedWarning,
} from "../../components/forms/StepForm.jsx";

import "../../styles/forms.css";

// Student application for the FP Dual programme, in steps (Phase 4, D.3).
// Same fields, rules and endpoint as before; only the presentation changed.

const STEPS = [
  { id: "ciclo", title: "Ciclo" },
  { id: "personales", title: "Datos personales" },
  { id: "contacto", title: "Contacto y movilidad" },
  { id: "documentos", title: "Documentos" },
  { id: "cuenta", title: "Cuenta" },
  { id: "revision", title: "Revisión y envío" },
];

const INITIAL = {
  emailColegio: "",
  especialidad: "",
  pref1: "",
  pref2: "",
  pref3: "",
  dni: "",
  nombre: "",
  fechaNacimiento: "",
  nacionalidad: "",
  sexo: "",
  tutorLegal: "",
  dniTutorLegal: "",
  email: "",
  telefono: "",
  domicilio: "",
  cp: "",
  localidad: "",
  carnet: "",
  vehiculo: "",
  idiomas: "",
  numeroSS: "",
  cv: null,
  anexoDga: null,
  password: "",
  password2: "",
};

const LABELS = {
  emailColegio: "Email del centro",
  especialidad: "Ciclo (especialidad)",
  dni: "DNI / NIE",
  nombre: "Nombre y apellidos",
  fechaNacimiento: "Fecha de nacimiento",
  nacionalidad: "Nacionalidad",
  sexo: "Sexo",
  tutorLegal: "Nombre del tutor legal",
  dniTutorLegal: "DNI/NIE del tutor legal",
  email: "Email personal",
  telefono: "Teléfono",
  domicilio: "Domicilio",
  cp: "Código postal",
  localidad: "Localidad",
  carnet: "Carnet de conducir",
  vehiculo: "Vehículo",
  idiomas: "Idiomas",
  numeroSS: "Nº de la Seguridad Social",
  cv: "Currículum",
  anexoDga: "Anexo DGA",
  password: "Contraseña",
  password2: "Repetir contraseña",
};

const COLEGIO_RE = /^[a-zA-Z0-9._%+-]+@zaragoza\.salesianos\.edu$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esMenor(fecha) {
  if (!fecha) return false;
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() - 18);
  return new Date(`${fecha}T12:00:00`) > limite;
}

const req = (v, msg = "Este campo es obligatorio.") => (String(v ?? "").trim() ? null : msg);
const isPdf = (f) => f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name));

function validateStep(id, v) {
  const e = {};
  if (id === "ciclo") {
    e.emailColegio = req(v.emailColegio) || (COLEGIO_RE.test(v.emailColegio.trim()) ? null : "Debe terminar en @zaragoza.salesianos.edu.");
    e.especialidad = req(v.especialidad, "Elige tu ciclo.");
  }
  if (id === "personales") {
    const dni = v.dni.trim().toUpperCase();
    e.dni = req(dni) || (dniNieValido(dni) ? null : "No es un DNI/NIE válido (8 números y letra, o X/Y/Z, 7 números y letra).");
    e.nombre = req(v.nombre);
    e.fechaNacimiento = req(v.fechaNacimiento);
    e.nacionalidad = req(v.nacionalidad);
    e.sexo = req(v.sexo, "Elige una opción.");
    if (esMenor(v.fechaNacimiento)) {
      e.tutorLegal = req(v.tutorLegal);
      const dt = v.dniTutorLegal.trim().toUpperCase();
      e.dniTutorLegal = req(dt) || (dniNieValido(dt) ? null : "No es un DNI/NIE válido.");
    }
  }
  if (id === "contacto") {
    e.email = req(v.email) || (EMAIL_RE.test(v.email.trim()) ? null : "Escribe un email válido.");
    e.telefono = req(v.telefono) || (/^[0-9]{9}$/.test(v.telefono.trim()) ? null : "Escribe 9 cifras, sin espacios.");
    e.domicilio = req(v.domicilio);
    e.cp = req(v.cp) || (/^[0-9]{5}$/.test(v.cp.trim()) ? null : "Escribe las 5 cifras del código postal.");
    e.localidad = req(v.localidad);
    e.carnet = req(v.carnet, "Elige una opción.");
    e.vehiculo = req(v.vehiculo, "Elige una opción.");
    e.idiomas = req(v.idiomas);
    const ss = v.numeroSS.replace(/\s/g, "");
    e.numeroSS = ss && !(/^[0-9]{12}$/.test(ss) && nSSValido(ss)) ? "Debe tener 12 cifras y ser un número válido." : null;
  }
  if (id === "documentos") {
    e.cv = !v.cv ? "Adjunta tu currículum." : isPdf(v.cv) ? null : "El archivo debe ser un PDF.";
    e.anexoDga = !v.anexoDga ? "Adjunta el Anexo DGA." : isPdf(v.anexoDga) ? null : "El archivo debe ser un PDF.";
  }
  if (id === "cuenta") {
    e.password = req(v.password) || (v.password.length >= 8 ? null : "Debe tener al menos 8 caracteres.");
    e.password2 = req(v.password2) || (v.password2 === v.password ? null : "Las contraseñas no coinciden.");
  }
  return e;
}

function AddDualStudent() {
  const toast = useToast();
  const form = useStepForm({ steps: STEPS, initialValues: INITIAL, validateStep });
  const { values: v, set, errors, step, headingRef } = form;
  const [especialidades, setEspecialidades] = useState({ status: "loading", items: [] });
  const [preferencias, setPreferencias] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [enviado, setEnviado] = useState(null);

  useUnsavedWarning(form.dirty && !enviado);

  const cargarEspecialidades = () => {
    setEspecialidades({ status: "loading", items: [] });
    publicJSON("/especialidades")
      .then((rows) => setEspecialidades({ status: "ready", items: Array.isArray(rows) ? rows : [] }))
      .catch(() => setEspecialidades({ status: "error", items: [] }));
  };
  useEffect(cargarEspecialidades, []);

  // Preferences depend on the chosen ciclo; changing ciclo clears them.
  useEffect(() => {
    setPreferencias([]);
    if (!v.especialidad) return;
    publicJSON(`/preferencias?id_especialidad=${encodeURIComponent(v.especialidad)}`)
      .then((rows) => setPreferencias(Array.isArray(rows) ? rows : []))
      .catch(() => setPreferencias([]));
  }, [v.especialidad]);

  const onEspecialidad = (name, value) => {
    set(name, value);
    set("pref1", "");
    set("pref2", "");
    set("pref3", "");
  };

  const handleSubmit = async () => {
    if (submitting || !form.validateAll()) return;
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append("emailColegio", v.emailColegio.trim());
      data.append("dni", v.dni.trim().toUpperCase());
      data.append("nombre", v.nombre.trim());
      data.append("sexo", v.sexo);
      data.append("fechaNacimiento", v.fechaNacimiento);
      data.append("nacionalidad", v.nacionalidad.trim());
      data.append("email", v.email.trim());
      data.append("telalumno", v.telefono.trim());
      data.append("carnetDeConducir", v.carnet === "true" ? 1 : 0);
      data.append("tieneCoche", v.vehiculo === "true" ? 1 : 0);
      data.append("idiomasConocidos", v.idiomas.trim());
      data.append("numeroSS", v.numeroSS.replace(/\s/g, ""));
      data.append("domicilio", v.domicilio.trim());
      data.append("cp", v.cp.trim());
      data.append("localidad", v.localidad.trim());
      data.append("id_especialidad_dual", v.especialidad);
      if (v.pref1) data.append("idPreferencia1", v.pref1);
      if (v.pref2) data.append("idPreferencia2", v.pref2);
      if (v.pref3) data.append("idPreferencia3", v.pref3);
      const menor = esMenor(v.fechaNacimiento);
      data.append("tutorLegal", menor ? v.tutorLegal.trim() : "");
      data.append("dniTutorLegal", menor ? v.dniTutorLegal.trim().toUpperCase() : "");
      data.append("anexoDga", v.anexoDga);
      data.append("cv", v.cv);
      data.append("password", v.password);
      const result = await postForm("/solicitudes/alumno", data);
      setEnviado({ cuentaExistente: Boolean(result?.cuenta_existente) });
      form.setDirty(false);
    } catch (err) {
      toast.error(err.message || "No se pudo enviar la solicitud. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const espOptions = especialidades.items.map((e) => ({
    value: String(e.id_especialidad),
    label: `${e.nombre}${e.turno ? ` (${String(e.turno).toLowerCase()})` : ""}`,
  }));
  const prefOptions = preferencias.map((p) => ({ value: String(p.id_preferencia), label: p.descripcion }));
  const nombreDe = (opts, value) => opts.find((o) => o.value === String(value))?.label || "";
  const siNo = (x) => (x === "true" ? "Sí" : x === "false" ? "No" : "");
  const menor = esMenor(v.fechaNacimiento);
  const field = (name) => ({ name, label: LABELS[name], value: v[name], onChange: set, error: errors[name] });

  const current = STEPS[step].id;

  return (
    <div className="page-container max-w-4xl">
      <PageHeader
        kicker="Alumnado"
        title="Presentar candidatura"
        subtitle="Inscríbete en el programa de FP Dual. Te llevará unos 10 minutos; ten a mano tu CV y el Anexo DGA en PDF."
      />
      <ConvocatoriaGate quien="alumnos">
        {enviado ? (
          <SubmitSuccess
            title="Solicitud enviada"
            onAnother={() => {
              form.reset();
              setEnviado(null);
            }}
            anotherLabel="Presentar otra solicitud"
          >
            <p className="m-0">
              El centro revisará tu documentación y te avisará por email del resultado.{" "}
              {enviado.cuentaExistente
                ? "Puedes seguir tu solicitud en el portal con tu DNI/NIE y la contraseña que ya tenías."
                : "Ya puedes seguir tu solicitud en el portal con tu DNI/NIE y la contraseña que has elegido."}
            </p>
          </SubmitSuccess>
        ) : (
          <form
            className="form-card"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step < STEPS.length - 1) form.next();
              else handleSubmit();
            }}
          >
            <Stepper steps={STEPS} current={step} onGoTo={form.goTo} />
            <ErrorSummary errors={errors} labels={LABELS} />
            <p className="mb-5 text-xs text-muted">
              Los campos marcados con <span aria-hidden="true" className="text-brand-700">*</span> son obligatorios.
            </p>

            {current === "ciclo" && (
              <>
                <StepHeading headingRef={headingRef} title="Ciclo" description="Elige el ciclo en el que estás matriculado." />
                <TextField
                  {...field("emailColegio")}
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={60}
                  hint="El correo que te da el centro: termina en @zaragoza.salesianos.edu."
                  placeholder="nombre.apellido@zaragoza.salesianos.edu"
                />
                {especialidades.status === "error" ? (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    No se pudieron cargar los ciclos.{" "}
                    <button type="button" className="font-semibold underline" onClick={cargarEspecialidades}>
                      Reintentar
                    </button>
                  </p>
                ) : (
                  <SelectField
                    {...field("especialidad")}
                    onChange={onEspecialidad}
                    required
                    options={espOptions}
                    disabled={especialidades.status === "loading"}
                    placeholder={especialidades.status === "loading" ? "Cargando ciclos…" : "Selecciona tu ciclo"}
                  />
                )}
                {prefOptions.length > 0 && (
                  <fieldset className="mt-2">
                    <legend className="mb-1 text-sm font-semibold text-charcoal-800">Preferencias (opcional)</legend>
                    <p className="mb-3 text-xs text-muted">Indica, por orden, los tipos de puesto que más te interesan.</p>
                    <div className="grid gap-4 md:grid-cols-3">
                      {["pref1", "pref2", "pref3"].map((p, i) => (
                        <SelectField
                          key={p}
                          name={p}
                          label={`Preferencia ${i + 1}`}
                          value={v[p]}
                          onChange={set}
                          options={prefOptions}
                          placeholder="Sin preferencia"
                        />
                      ))}
                    </div>
                  </fieldset>
                )}
              </>
            )}

            {current === "personales" && (
              <>
                <StepHeading headingRef={headingRef} title="Datos personales" />
                <div className="grid gap-x-4 md:grid-cols-2">
                  <TextField
                    {...field("dni")}
                    required
                    maxLength={10}
                    autoComplete="off"
                    hint="Con letra, sin espacios ni guiones. Es tu usuario para entrar al portal."
                    placeholder="12345678Z"
                    onChange={(n, val) => set(n, val.toUpperCase())}
                  />
                  <TextField {...field("nombre")} required maxLength={100} autoComplete="name" />
                  <TextField {...field("fechaNacimiento")} type="date" required autoComplete="bday" />
                  <TextField {...field("nacionalidad")} required maxLength={50} placeholder="Española" />
                </div>
                <RadioField
                  {...field("sexo")}
                  required
                  options={[
                    { value: "Hombre", label: "Hombre" },
                    { value: "Mujer", label: "Mujer" },
                  ]}
                />
                {menor && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="mb-3 text-sm font-semibold text-amber-950">
                      Eres menor de edad: indica los datos de tu tutor o tutora legal.
                    </p>
                    <div className="grid gap-x-4 md:grid-cols-2">
                      <TextField {...field("tutorLegal")} required maxLength={45} />
                      <TextField
                        {...field("dniTutorLegal")}
                        required
                        maxLength={10}
                        onChange={(n, val) => set(n, val.toUpperCase())}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {current === "contacto" && (
              <>
                <StepHeading
                  headingRef={headingRef}
                  title="Contacto y movilidad"
                  description="Usaremos tu email personal para avisarte de cambios en tu solicitud."
                />
                <div className="grid gap-x-4 md:grid-cols-2">
                  <TextField {...field("email")} type="email" required maxLength={100} autoComplete="email" />
                  <TextField
                    {...field("telefono")}
                    type="tel"
                    required
                    inputMode="numeric"
                    maxLength={9}
                    autoComplete="tel-national"
                    hint="9 cifras."
                  />
                </div>
                <TextField {...field("domicilio")} required maxLength={255} autoComplete="street-address" placeholder="Calle, número, piso" />
                <div className="grid gap-x-4 md:grid-cols-2">
                  <TextField {...field("cp")} required inputMode="numeric" maxLength={5} autoComplete="postal-code" />
                  <TextField {...field("localidad")} required maxLength={100} autoComplete="address-level2" />
                </div>
                <div className="grid gap-x-4 md:grid-cols-2">
                  <RadioField
                    {...field("carnet")}
                    label="¿Tienes carnet de conducir?"
                    required
                    options={[
                      { value: "true", label: "Sí" },
                      { value: "false", label: "No" },
                    ]}
                  />
                  <RadioField
                    {...field("vehiculo")}
                    label="¿Tienes vehículo para ir a trabajar?"
                    required
                    options={[
                      { value: "true", label: "Sí, tengo vehículo" },
                      { value: "false", label: "No" },
                    ]}
                  />
                </div>
                <div className="grid gap-x-4 md:grid-cols-2">
                  <TextField {...field("idiomas")} label="Idiomas y nivel" required maxLength={255} placeholder="Inglés B2, francés A2" />
                  <TextField
                    {...field("numeroSS")}
                    label="Nº de la Seguridad Social (si lo tienes)"
                    inputMode="numeric"
                    maxLength={14}
                    hint="12 cifras. Déjalo en blanco si todavía no lo tienes."
                  />
                </div>
              </>
            )}

            {current === "documentos" && (
              <>
                <StepHeading
                  headingRef={headingRef}
                  title="Documentos"
                  description="Ambos en PDF. El centro los revisará antes de validar tu solicitud."
                />
                <FileField name="cv" label="Currículum (PDF)" file={v.cv} onChange={set} error={errors.cv} required />
                <FileField
                  name="anexoDga"
                  label="Anexo DGA (PDF)"
                  file={v.anexoDga}
                  onChange={set}
                  error={errors.anexoDga}
                  required
                  hint="El documento de la DGA firmado. Si no lo tienes, pídelo en secretaría."
                />
              </>
            )}

            {current === "cuenta" && (
              <>
                <StepHeading
                  headingRef={headingRef}
                  title="Cuenta del portal"
                  description="Entrarás al portal con tu DNI/NIE y esta contraseña. Si ya tienes cuenta de un curso anterior, escribe tu contraseña actual."
                />
                <div className="grid gap-x-4 md:grid-cols-2">
                  <TextField
                    {...field("password")}
                    type="password"
                    required
                    minLength={8}
                    maxLength={100}
                    autoComplete="new-password"
                    hint="Mínimo 8 caracteres."
                  />
                  <TextField {...field("password2")} type="password" required maxLength={100} autoComplete="new-password" />
                </div>
              </>
            )}

            {current === "revision" && (
              <>
                <StepHeading
                  headingRef={headingRef}
                  title="Revisión y envío"
                  description="Comprueba los datos. Puedes modificar cualquier apartado antes de enviar."
                />
                <div className="space-y-3">
                  <ReviewSection
                    title="Ciclo"
                    onEdit={() => form.goTo(0)}
                    rows={[
                      [LABELS.emailColegio, v.emailColegio],
                      [LABELS.especialidad, nombreDe(espOptions, v.especialidad)],
                      ["Preferencias", [v.pref1, v.pref2, v.pref3].filter(Boolean).map((p) => nombreDe(prefOptions, p)).join(" · ")],
                    ]}
                  />
                  <ReviewSection
                    title="Datos personales"
                    onEdit={() => form.goTo(1)}
                    rows={[
                      [LABELS.dni, v.dni],
                      [LABELS.nombre, v.nombre],
                      [LABELS.fechaNacimiento, v.fechaNacimiento && new Date(`${v.fechaNacimiento}T12:00:00`).toLocaleDateString("es-ES")],
                      [LABELS.nacionalidad, v.nacionalidad],
                      [LABELS.sexo, v.sexo],
                      ...(menor ? [[LABELS.tutorLegal, v.tutorLegal], [LABELS.dniTutorLegal, v.dniTutorLegal]] : []),
                    ]}
                  />
                  <ReviewSection
                    title="Contacto y movilidad"
                    onEdit={() => form.goTo(2)}
                    rows={[
                      [LABELS.email, v.email],
                      [LABELS.telefono, v.telefono],
                      [LABELS.domicilio, [v.domicilio, v.cp, v.localidad].filter(Boolean).join(", ")],
                      [LABELS.carnet, siNo(v.carnet)],
                      [LABELS.vehiculo, siNo(v.vehiculo)],
                      [LABELS.idiomas, v.idiomas],
                      [LABELS.numeroSS, v.numeroSS],
                    ]}
                  />
                  <ReviewSection
                    title="Documentos"
                    onEdit={() => form.goTo(3)}
                    rows={[
                      [LABELS.cv, v.cv?.name],
                      [LABELS.anexoDga, v.anexoDga?.name],
                    ]}
                  />
                </div>
                <p className="mb-0 mt-4 text-xs leading-5 text-muted">
                  Al enviar, declaras que los datos son correctos y que los documentos son tuyos. El centro tratará tus datos
                  solo para gestionar tu participación en el programa de FP Dual.
                </p>
                <SubmitProgress submitting={submitting} />
              </>
            )}

            <StepNav
              step={step}
              total={STEPS.length}
              onBack={form.back}
              onNext={form.next}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitLabel="Enviar solicitud"
            />
          </form>
        )}
      </ConvocatoriaGate>
    </div>
  );
}

export default AddDualStudent;
