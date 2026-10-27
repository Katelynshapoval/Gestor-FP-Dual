import { useEffect, useState } from "react";
import { cifValido, dniNieValido } from "../../utils/formatValidation.js";
import { getJSON, postJSON } from "../../utils/api.js";
import SpecialitySelector from "./SpecialitySelector.jsx";
import TransportSelector from "./TransportSelector.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";
import ConvocatoriaGate from "../../components/forms/ConvocatoriaGate.jsx";
import SubmitSuccess from "../../components/forms/SubmitSuccess.jsx";
import {
  ErrorSummary,
  ReviewSection,
  StepHeading,
  StepNav,
  Stepper,
  SubmitProgress,
  TextField,
  useStepForm,
  useUnsavedWarning,
} from "../../components/forms/StepForm.jsx";
import "../../styles/forms.css";

// Company application to join the FP Dual programme, in steps (Phase 4, D.3).
// Same fields and endpoint as before (WF-12: nothing is invented or copied).

const STEPS = [
  { id: "empresa", title: "Empresa" },
  { id: "representante", title: "Responsable legal" },
  { id: "coordinador", title: "Coordinador" },
  { id: "puesto", title: "Puesto y ciclos" },
  { id: "cuenta", title: "Cuenta" },
  { id: "revision", title: "Revisión y envío" },
];

const INITIAL = {
  razonSocial: "",
  cif: "",
  telEmpresa: "",
  dirRazSocial: "",
  municipio: "",
  provincia: "",
  cpRazSoc: "",
  responsableLegal: "",
  dniRl: "",
  cargo: "",
  emailRepresentante: "",
  telefonoRepresentante: "",
  dniCoordinador: "",
  nombreCoordinador: "",
  emailCoordinador: "",
  telefonoCoordinador: "",
  descripcionPuesto: "",
  mismoLugarTrabajo: true,
  direccionLugarTrabajo: "",
  municipioTrabajo: "",
  provinciaTrabajo: "",
  cpTrabajo: "",
  especialidades: {}, // { [id_especialidad]: plazas }
  transportes: [],
  password: "",
  password2: "",
};

const LABELS = {
  razonSocial: "Razón social",
  cif: "CIF",
  telEmpresa: "Teléfono de la empresa",
  dirRazSocial: "Dirección fiscal",
  municipio: "Municipio",
  provincia: "Provincia",
  cpRazSoc: "Código postal",
  responsableLegal: "Nombre y apellidos",
  dniRl: "DNI/NIE",
  cargo: "Cargo",
  emailRepresentante: "Email",
  telefonoRepresentante: "Teléfono",
  dniCoordinador: "DNI/NIE",
  nombreCoordinador: "Nombre y apellidos",
  emailCoordinador: "Email",
  telefonoCoordinador: "Teléfono",
  descripcionPuesto: "Descripción del puesto",
  direccionLugarTrabajo: "Dirección del lugar de trabajo",
  municipioTrabajo: "Municipio del lugar de trabajo",
  provinciaTrabajo: "Provincia del lugar de trabajo",
  cpTrabajo: "Código postal del lugar de trabajo",
  especialidades: "Ciclos y plazas",
  password: "Contraseña",
  password2: "Repetir contraseña",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL_RE = /^[0-9+\s]{9,15}$/;
const req = (v, msg = "Este campo es obligatorio.") => (String(v ?? "").trim() ? null : msg);
const email = (v) => req(v) || (EMAIL_RE.test(v.trim()) ? null : "Escribe un email válido.");
const tel = (v) => req(v) || (TEL_RE.test(v.trim()) ? null : "Escribe un teléfono válido (al menos 9 cifras).");
const dni = (v) => req(v) || (dniNieValido(v.trim().toUpperCase()) ? null : "No es un DNI/NIE válido.");
const cp = (v) => req(v) || (/^[0-9]{5}$/.test(v.trim()) ? null : "Escribe las 5 cifras del código postal.");

function validateStep(id, v) {
  const e = {};
  if (id === "empresa") {
    e.razonSocial = req(v.razonSocial);
    const c = v.cif.trim().toUpperCase();
    e.cif = req(c) || (/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(c) && cifValido(c) ? null : "No es un CIF válido (letra, 7 cifras y control).");
    e.telEmpresa = v.telEmpresa.trim() && !TEL_RE.test(v.telEmpresa.trim()) ? "Escribe un teléfono válido." : null;
    e.dirRazSocial = req(v.dirRazSocial);
    e.municipio = req(v.municipio);
    e.provincia = req(v.provincia);
    e.cpRazSoc = cp(v.cpRazSoc);
  }
  if (id === "representante") {
    e.responsableLegal = req(v.responsableLegal);
    e.dniRl = dni(v.dniRl);
    e.cargo = req(v.cargo);
    e.emailRepresentante = email(v.emailRepresentante);
    e.telefonoRepresentante = tel(v.telefonoRepresentante);
  }
  if (id === "coordinador") {
    e.dniCoordinador = dni(v.dniCoordinador);
    e.nombreCoordinador = req(v.nombreCoordinador);
    e.emailCoordinador = email(v.emailCoordinador);
    e.telefonoCoordinador = tel(v.telefonoCoordinador);
  }
  if (id === "puesto") {
    e.descripcionPuesto = req(v.descripcionPuesto);
    if (!v.mismoLugarTrabajo) {
      e.direccionLugarTrabajo = req(v.direccionLugarTrabajo);
      e.municipioTrabajo = req(v.municipioTrabajo);
      e.provinciaTrabajo = req(v.provinciaTrabajo);
      e.cpTrabajo = cp(v.cpTrabajo);
    }
    const plazas = Object.values(v.especialidades);
    e.especialidades = !plazas.length
      ? "Marca al menos un ciclo."
      : plazas.some((n) => !(n >= 1))
        ? "Indica al menos un alumno en cada ciclo marcado."
        : null;
  }
  if (id === "cuenta") {
    e.password = req(v.password) || (v.password.length >= 8 ? null : "Debe tener al menos 8 caracteres.");
    e.password2 = req(v.password2) || (v.password2 === v.password ? null : "Las contraseñas no coinciden.");
  }
  return e;
}

const AddCompanyRequest = () => {
  const toast = useToast();
  const form = useStepForm({ steps: STEPS, initialValues: INITIAL, validateStep });
  const { values: v, set, errors, step, headingRef } = form;
  const [catalogo, setCatalogo] = useState({ status: "loading", especialidades: [], transportes: [] });
  const [catalogToken, setCatalogToken] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useUnsavedWarning(form.dirty && !enviado);

  useEffect(() => {
    setCatalogo((c) => ({ ...c, status: "loading" }));
    Promise.all([getJSON("/especialidades"), getJSON("/transportes")])
      .then(([esp, tra]) =>
        setCatalogo({
          status: "ready",
          especialidades: Array.isArray(esp) ? esp : [],
          transportes: Array.isArray(tra) ? tra : [],
        }),
      )
      .catch(() => setCatalogo({ status: "error", especialidades: [], transportes: [] }));
  }, [catalogToken]);

  const toggleEspecialidad = (id) => {
    const next = { ...v.especialidades };
    if (id in next) delete next[id];
    else next[id] = 1;
    set("especialidades", next);
  };
  const setPlazas = (id, n) => set("especialidades", { ...v.especialidades, [id]: n });
  const toggleTransporte = (id) =>
    set("transportes", v.transportes.includes(id) ? v.transportes.filter((t) => t !== id) : [...v.transportes, id]);

  const handleSubmit = async () => {
    if (submitting || !form.validateAll()) return;
    setSubmitting(true);
    try {
      await postJSON("/solicitudes/empresa", {
        cif: v.cif.trim().toUpperCase(),
        empresa: v.razonSocial.trim(),
        telefonoEmpresa: v.telEmpresa.trim(),
        domicilioLegal: v.dirRazSocial.trim(),
        cpLegal: v.cpRazSoc.trim(),
        provinciaLegal: v.provincia.trim(),
        localidadLegal: v.municipio.trim(),
        municipioLegal: v.municipio.trim(),
        // WF-12: only what the company entered is stored. With
        // mismoLugarTrabajo the backend reuses the legal address record.
        mismoLugarTrabajo: v.mismoLugarTrabajo,
        ...(v.mismoLugarTrabajo
          ? {}
          : {
              domicilioTrabajo: v.direccionLugarTrabajo.trim(),
              cpTrabajo: v.cpTrabajo.trim(),
              provinciaTrabajo: v.provinciaTrabajo.trim(),
              localidadTrabajo: v.municipioTrabajo.trim(),
              municipioTrabajo: v.municipioTrabajo.trim(),
            }),
        dniRepresentante: v.dniRl.trim().toUpperCase(),
        nombreRepresentante: v.responsableLegal.trim(),
        emailRepresentante: v.emailRepresentante.trim(),
        telefonoRepresentante: v.telefonoRepresentante.trim(),
        cargoRepresentante: v.cargo.trim(),
        dniCoordinador: v.dniCoordinador.trim().toUpperCase(),
        nombreCoordinador: v.nombreCoordinador.trim(),
        emailCoordinador: v.emailCoordinador.trim(),
        telefonoCoordinador: v.telefonoCoordinador.trim(),
        cargoCoordinador: "COORDINADOR DUAL",
        descripcion_puesto: v.descripcionPuesto.trim(),
        especialidades: Object.entries(v.especialidades).map(([id, n]) => ({
          idEspecialidad: Number(id),
          cantidadAlumnos: n,
        })),
        transportes: v.transportes,
        passwordCoordinador: v.password,
      });
      setEnviado(true);
      form.setDirty(false);
    } catch (err) {
      toast.error(err.message || "No se pudo enviar la solicitud. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const field = (name) => ({ name, label: LABELS[name], value: v[name], onChange: set, error: errors[name] });
  const nombreEsp = (id) => catalogo.especialidades.find((e) => String(e.id_especialidad) === String(id))?.nombre || id;
  const nombreTra = (id) => {
    const t = catalogo.transportes.find((x) => String(x.id_transporte ?? x.idTransporte) === String(id));
    return t?.nombre_mostrar ?? t?.nombre ?? id;
  };
  const current = STEPS[step].id;

  return (
    <div className="page-container max-w-4xl">
      <PageHeader
        kicker="Empresas"
        title="Solicitud de empresa colaboradora"
        subtitle="Primer paso para participar en el programa de FP Dual. No tiene vinculación legal: el compromiso se formaliza con el convenio."
      />
      <ConvocatoriaGate quien="empresas">
        {enviado ? (
          <SubmitSuccess title="Solicitud enviada">
            <p className="m-0">
              El convenio se envía al email del coordinador y queda en el portal. Entrad con el <strong>CIF</strong> de la empresa y la
              contraseña elegida para firmarlo; el centro validará la solicitud cuando el convenio esté firmado.
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

            {current === "empresa" && (
              <>
                <StepHeading headingRef={headingRef} title="Datos de la empresa" />
                <div className="grid gap-x-4 md:grid-cols-2">
                  <TextField {...field("razonSocial")} required maxLength={100} autoComplete="organization" />
                  <TextField
                    {...field("cif")}
                    required
                    maxLength={9}
                    hint="Será el usuario para entrar al portal."
                    placeholder="B12345678"
                    onChange={(n, val) => set(n, val.toUpperCase().replace(/\s/g, ""))}
                  />
                  <TextField {...field("telEmpresa")} type="tel" maxLength={20} autoComplete="tel" />
                </div>
                <TextField {...field("dirRazSocial")} required maxLength={255} autoComplete="street-address" />
                <div className="grid gap-x-4 md:grid-cols-3">
                  <TextField {...field("municipio")} required maxLength={100} autoComplete="address-level2" />
                  <TextField {...field("provincia")} required maxLength={50} autoComplete="address-level1" />
                  <TextField {...field("cpRazSoc")} required inputMode="numeric" maxLength={5} autoComplete="postal-code" />
                </div>
              </>
            )}

            {current === "representante" && (
              <>
                <StepHeading
                  headingRef={headingRef}
                  title="Responsable legal"
                  description="La persona que firma el convenio en nombre de la empresa."
                />
                <div className="grid gap-x-4 md:grid-cols-2">
                  <TextField {...field("responsableLegal")} required maxLength={100} />
                  <TextField {...field("dniRl")} required maxLength={10} onChange={(n, val) => set(n, val.toUpperCase())} />
                  <TextField {...field("cargo")} required maxLength={100} placeholder="Administrador único" />
                  <TextField {...field("emailRepresentante")} type="email" required maxLength={100} />
                  <TextField {...field("telefonoRepresentante")} type="tel" required maxLength={20} />
                </div>
              </>
            )}

            {current === "coordinador" && (
              <>
                <StepHeading
                  headingRef={headingRef}
                  title="Coordinador principal"
                  description="Recibe los avisos y documentos del programa, gestiona el portal y queda como primer tutor de la empresa. Podréis añadir más tutores desde el portal."
                />
                <div className="grid gap-x-4 md:grid-cols-2">
                  <TextField {...field("nombreCoordinador")} required maxLength={100} autoComplete="name" />
                  <TextField {...field("dniCoordinador")} required maxLength={10} onChange={(n, val) => set(n, val.toUpperCase())} />
                  <TextField
                    {...field("emailCoordinador")}
                    type="email"
                    required
                    maxLength={100}
                    autoComplete="email"
                    hint="Aquí recibiréis el convenio y los avisos."
                  />
                  <TextField {...field("telefonoCoordinador")} type="tel" required maxLength={20} autoComplete="tel" />
                </div>
              </>
            )}

            {current === "puesto" && (
              <>
                <StepHeading headingRef={headingRef} title="Puesto y ciclos" />
                <div className="field">
                  <label htmlFor="campo-descripcionPuesto">
                    {LABELS.descripcionPuesto}
                    <span aria-hidden="true" className="ml-0.5 text-brand-700">*</span>
                    <span className="sr-only"> (obligatorio)</span>
                  </label>
                  <p id="campo-descripcionPuesto-ayuda" className="-mt-1 mb-2 text-xs leading-5 text-muted">
                    Las tareas que realizará el alumno.
                  </p>
                  <textarea
                    id="campo-descripcionPuesto"
                    className={`textarea ${errors.descripcionPuesto ? "border-red-400" : ""}`}
                    value={v.descripcionPuesto}
                    onChange={(e) => set("descripcionPuesto", e.target.value)}
                    maxLength={500}
                    aria-invalid={errors.descripcionPuesto ? true : undefined}
                    aria-describedby={`campo-descripcionPuesto-ayuda${errors.descripcionPuesto ? " campo-descripcionPuesto-error" : ""}`}
                  />
                  {errors.descripcionPuesto && (
                    <p id="campo-descripcionPuesto-error" className="mb-0 mt-1.5 text-sm font-medium text-red-700">
                      <span aria-hidden="true">! </span>
                      {errors.descripcionPuesto}
                    </p>
                  )}
                </div>

                <fieldset className="field">
                  <legend className="mb-2 block text-sm font-semibold text-charcoal-800">Lugar de trabajo</legend>
                  <label className="flex items-center gap-2 text-sm text-charcoal-800">
                    <input
                      type="checkbox"
                      className="accent-brand-500"
                      checked={v.mismoLugarTrabajo}
                      onChange={(e) => set("mismoLugarTrabajo", e.target.checked)}
                    />
                    El alumno trabajará en la dirección fiscal de la empresa
                  </label>
                  {!v.mismoLugarTrabajo && (
                    <div className="mt-4 grid gap-x-4 md:grid-cols-2">
                      <TextField {...field("direccionLugarTrabajo")} required maxLength={255} className="md:col-span-2" />
                      <TextField {...field("municipioTrabajo")} required maxLength={100} />
                      <TextField {...field("provinciaTrabajo")} required maxLength={50} />
                      <TextField {...field("cpTrabajo")} required inputMode="numeric" maxLength={5} />
                    </div>
                  )}
                </fieldset>

                {catalogo.status === "error" ? (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    No se pudieron cargar los ciclos y los transportes.{" "}
                    <button type="button" className="font-semibold underline" onClick={() => setCatalogToken((n) => n + 1)}>
                      Reintentar
                    </button>
                  </p>
                ) : catalogo.status === "loading" ? (
                  <p role="status" className="text-sm text-muted">
                    Cargando ciclos…
                  </p>
                ) : (
                  <>
                    <SpecialitySelector
                      dataSpecialities={catalogo.especialidades}
                      selected={v.especialidades}
                      onToggle={toggleEspecialidad}
                      onAmountChange={setPlazas}
                      error={errors.especialidades}
                    />
                    <TransportSelector
                      dataTransports={catalogo.transportes}
                      metodosTransporte={v.transportes}
                      onToggle={toggleTransporte}
                    />
                  </>
                )}
              </>
            )}

            {current === "cuenta" && (
              <>
                <StepHeading
                  headingRef={headingRef}
                  title="Cuenta del portal"
                  description="Entraréis al portal con el CIF de la empresa y esta contraseña."
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
                  description="Comprobad los datos. Podéis modificar cualquier apartado antes de enviar."
                />
                <div className="space-y-3">
                  <ReviewSection
                    title="Empresa"
                    onEdit={() => form.goTo(0)}
                    rows={[
                      [LABELS.razonSocial, v.razonSocial],
                      [LABELS.cif, v.cif],
                      [LABELS.telEmpresa, v.telEmpresa],
                      [LABELS.dirRazSocial, [v.dirRazSocial, v.cpRazSoc, v.municipio, v.provincia].filter(Boolean).join(", ")],
                    ]}
                  />
                  <ReviewSection
                    title="Responsable legal"
                    onEdit={() => form.goTo(1)}
                    rows={[
                      ["Nombre", v.responsableLegal],
                      ["DNI/NIE", v.dniRl],
                      ["Cargo", v.cargo],
                      ["Email", v.emailRepresentante],
                      ["Teléfono", v.telefonoRepresentante],
                    ]}
                  />
                  <ReviewSection
                    title="Coordinador principal"
                    onEdit={() => form.goTo(2)}
                    rows={[
                      ["Nombre", v.nombreCoordinador],
                      ["DNI/NIE", v.dniCoordinador],
                      ["Email", v.emailCoordinador],
                      ["Teléfono", v.telefonoCoordinador],
                    ]}
                  />
                  <ReviewSection
                    title="Puesto y ciclos"
                    onEdit={() => form.goTo(3)}
                    rows={[
                      [LABELS.descripcionPuesto, v.descripcionPuesto],
                      [
                        "Lugar de trabajo",
                        v.mismoLugarTrabajo
                          ? "La dirección fiscal"
                          : [v.direccionLugarTrabajo, v.cpTrabajo, v.municipioTrabajo, v.provinciaTrabajo].filter(Boolean).join(", "),
                      ],
                      [
                        "Ciclos",
                        Object.entries(v.especialidades)
                          .map(([id, n]) => `${nombreEsp(id)}: ${n} ${n === 1 ? "alumno" : "alumnos"}`)
                          .join(" · "),
                      ],
                      ["Transporte", v.transportes.map(nombreTra).join(", ")],
                    ]}
                  />
                </div>
                <SubmitProgress submitting={submitting} text="Enviando la solicitud y generando el convenio. Puede tardar unos segundos; no cierres esta página." />
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
};

export default AddCompanyRequest;
