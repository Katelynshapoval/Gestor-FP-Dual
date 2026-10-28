import { useState } from "react";
import { MdBadge, MdBusiness, MdGavel, MdLocationOn, MdWorkOutline } from "react-icons/md";
import TransportSelector from "../AddCompanyRequest/TransportSelector.jsx";
import { TextField } from "../../components/forms/StepForm.jsx";
import {
  EditGrid,
  EditSection,
  LockedField,
  SwitchField,
  W,
  focusFirstError,
} from "../../components/forms/EditDialog.jsx";

// Company data form, shown inside EditDialog: Administración edits directly
// (EmpresaDatosActions) and the company sends it for review (portal MisDatos).
// Only Administración can change the CIF (it is the portal login).

export const COMPANY_SECTIONS = [
  { id: "emp-empresa", label: "Empresa" },
  { id: "emp-fiscal", label: "Domicilio fiscal" },
  { id: "emp-trabajo", label: "Lugar de trabajo" },
  { id: "emp-legal", label: "Responsable legal" },
  { id: "emp-coord", label: "Coordinador" },
  { id: "emp-puesto", label: "Puesto y transporte" },
];

export const emptyCompanyForm = () => ({
  empresa: "",
  cif: "",
  telefonoEmpresa: "",
  emailEmpresa: "",
  web: "",
  observaciones: "",
  domicilioLegal: "",
  cpLegal: "",
  provinciaLegal: "",
  localidadLegal: "",
  municipioLegal: "",
  telefonoLegal: "",
  emailLegal: "",
  domicilioTrabajo: "",
  cpTrabajo: "",
  provinciaTrabajo: "",
  localidadTrabajo: "",
  municipioTrabajo: "",
  telefonoTrabajo: "",
  emailTrabajo: "",
  dniRepresentante: "",
  nombreRepresentante: "",
  emailRepresentante: "",
  telefonoRepresentante: "",
  cargoRepresentante: "",
  dniCoordinador: "",
  nombreCoordinador: "",
  emailCoordinador: "",
  telefonoCoordinador: "",
  cargoCoordinador: "",
  descripcion_puesto: "",
  transportes: [],
});

export function datosToForm(datos) {
  const base = emptyCompanyForm();
  if (!datos) return base;
  Object.keys(base).forEach((key) => {
    if (key === "transportes") {
      base.transportes = (datos.transportes || []).map((t) =>
        Number(typeof t === "object" ? t.id_transporte : t)
      ).filter((n) => Number.isInteger(n) && n > 0);
    } else if (datos[key] != null) {
      base[key] = String(datos[key]);
    }
  });
  return base;
}

export function applyProposed(datos, proposed) {
  const form = datosToForm(datos);
  if (!proposed) return form;
  Object.keys(proposed).forEach((key) => {
    if (key === "transportes") form.transportes = proposed[key] || [];
    else if (key in form) form[key] = proposed[key] ?? "";
  });
  return form;
}

const addressesMatch = (values) =>
  values.domicilioTrabajo === values.domicilioLegal &&
  values.cpTrabajo === values.cpLegal &&
  values.provinciaTrabajo === values.provinciaLegal &&
  values.localidadTrabajo === values.localidadLegal;

const CompanyEditForm = ({ formId, values, onChange, allowCif = false, transports = [], onSubmit }) => {
  const [sameWork, setSameWork] = useState(() => addressesMatch(values));
  const [errores, setErrores] = useState({});
  const set = (key, value) => {
    onChange({ ...values, [key]: value });
    if (errores[key]) setErrores((e) => ({ ...e, [key]: undefined }));
  };

  const handleSameWork = (checked) => {
    setSameWork(checked);
    if (!checked) return;
    onChange({
      ...values,
      domicilioTrabajo: values.domicilioLegal,
      cpTrabajo: values.cpLegal,
      provinciaTrabajo: values.provinciaLegal,
      localidadTrabajo: values.localidadLegal,
      municipioTrabajo: values.municipioLegal,
      telefonoTrabajo: values.telefonoLegal,
      emailTrabajo: values.emailLegal,
    });
  };

  const payload = () => {
    const body = { ...values };
    if (!allowCif) delete body.cif;
    if (sameWork) {
      body.domicilioTrabajo = body.domicilioLegal;
      body.cpTrabajo = body.cpLegal;
      body.provinciaTrabajo = body.provinciaLegal;
      body.localidadTrabajo = body.localidadLegal;
      body.municipioTrabajo = body.municipioLegal;
      body.telefonoTrabajo = body.telefonoLegal;
      body.emailTrabajo = body.emailLegal;
    }
    return body;
  };

  const submit = (event) => {
    event.preventDefault();
    const e = {};
    if (!values.empresa.trim()) e.empresa = "Este campo es obligatorio.";
    if (allowCif && !values.cif.trim()) e.cif = "Este campo es obligatorio.";
    setErrores(e);
    if (Object.keys(e).length) focusFirstError(e, ["empresa", "cif"]);
    else onSubmit(payload());
  };

  const field = (name, label) => ({
    name,
    label,
    value: values[name],
    onChange: set,
    error: errores[name],
  });

  // Dirección · CP / Municipio · Localidad / Provincia · Teléfono / Email
  const address = (suffix) => (
    <EditGrid>
      <TextField {...field(`domicilio${suffix}`, "Dirección")} maxLength={255} className={W.full} />
      <TextField {...field(`cp${suffix}`, "Código postal")} inputMode="numeric" maxLength={10} className={W.half} />
      <TextField {...field(`municipio${suffix}`, "Municipio")} maxLength={100} className={W.half} />
      <TextField {...field(`localidad${suffix}`, "Localidad")} maxLength={100} className={W.half} />
      <TextField {...field(`provincia${suffix}`, "Provincia")} maxLength={50} className={W.half} />
      <TextField {...field(`telefono${suffix}`, "Teléfono")} type="tel" maxLength={20} className={W.half} />
      <TextField {...field(`email${suffix}`, "Email")} type="email" maxLength={100} className={W.half} />
    </EditGrid>
  );

  // Nombre · DNI / Cargo · Teléfono / Email
  const person = (suffix) => (
    <EditGrid>
      <TextField {...field(`nombre${suffix}`, "Nombre y apellidos")} maxLength={100} className={W.full} />
      <TextField
        {...field(`dni${suffix}`, "DNI / NIE")}
        onChange={(n, v) => set(n, v.toUpperCase())}
        maxLength={15}
        className={W.half}
      />
      <TextField {...field(`cargo${suffix}`, "Cargo")} maxLength={100} className={W.half} />
      <TextField {...field(`telefono${suffix}`, "Teléfono")} type="tel" maxLength={20} className={W.half} />
      <TextField {...field(`email${suffix}`, "Email")} type="email" maxLength={100} className={W.half} />
    </EditGrid>
  );

  return (
    <form id={formId} noValidate onSubmit={submit}>
      <EditSection id="emp-empresa" icon={MdBusiness} title="Empresa" description="Datos generales y de contacto.">
        <EditGrid>
          <TextField {...field("empresa", "Razón social")} required maxLength={100} className={W.full} />
          {allowCif ? (
            <TextField
              {...field("cif", "CIF")}
              required
              onChange={(n, v) => set(n, v.toUpperCase())}
              maxLength={12}
              hint="Es el identificador de acceso al portal."
              className={W.half}
            />
          ) : (
            <LockedField label="CIF" value={values.cif} hint="El CIF no se puede modificar." className={W.half} />
          )}
          <TextField {...field("web", "Web")} maxLength={150} placeholder="https://" className={W.half} />
          <TextField {...field("telefonoEmpresa", "Teléfono")} type="tel" maxLength={20} className={W.half} />
          <TextField {...field("emailEmpresa", "Email")} type="email" maxLength={100} className={W.half} />
          <TextField {...field("observaciones", "Observaciones")} maxLength={255} className={W.full} />
        </EditGrid>
      </EditSection>

      <EditSection id="emp-fiscal" icon={MdLocationOn} title="Domicilio fiscal" description="El que figura en el convenio.">
        {address("Legal")}
      </EditSection>

      <EditSection id="emp-trabajo" icon={MdLocationOn} title="Lugar de trabajo" description="Donde el alumno hará las prácticas.">
        <SwitchField
          id="emp-mismo-domicilio"
          label="Coincide con el domicilio fiscal"
          description="Desactívalo si el alumno trabajará en otra dirección."
          checked={sameWork}
          onChange={handleSameWork}
        />
        {!sameWork && <div className="mt-4">{address("Trabajo")}</div>}
      </EditSection>

      <EditSection id="emp-legal" icon={MdGavel} title="Responsable legal" description="Persona que firma el convenio.">
        {person("Representante")}
      </EditSection>

      <EditSection
        id="emp-coord"
        icon={MdBadge}
        title="Coordinador principal"
        description="Contacto del acceso al portal. Los tutores de alumnos se gestionan aparte."
      >
        {person("Coordinador")}
      </EditSection>

      <EditSection id="emp-puesto" icon={MdWorkOutline} title="Puesto y transporte" description="Qué hará el alumno y cómo puede llegar.">
        <EditGrid>
          <div className={`field ${W.full}`}>
            <label htmlFor="campo-descripcion_puesto">Descripción del puesto</label>
            <textarea
              id="campo-descripcion_puesto"
              className="textarea text-sm"
              value={values.descripcion_puesto}
              onChange={(e) => set("descripcion_puesto", e.target.value)}
              maxLength={2000}
            />
            <p className="mb-0 mt-1 text-right text-xs text-muted">{values.descripcion_puesto.length} / 2000</p>
          </div>
          <TransportSelector
            className={W.full}
            dataTransports={transports}
            metodosTransporte={values.transportes}
            onToggle={(id) => {
              const n = Number(id);
              const next = values.transportes.includes(n)
                ? values.transportes.filter((t) => t !== n)
                : [...values.transportes, n];
              set("transportes", next);
            }}
          />
        </EditGrid>
      </EditSection>
    </form>
  );
};

export default CompanyEditForm;
