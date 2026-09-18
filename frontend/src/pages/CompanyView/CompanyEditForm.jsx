import { useState } from "react";
import TransportSelector from "../AddCompanyRequest/TransportSelector.jsx";

const Field = ({ id, label, hint, children }) => (
  <div className="field">
    <label htmlFor={id}>{label}</label>
    {hint && <p className="field-hint">{hint}</p>}
    {children}
  </div>
);

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

const CompanyEditForm = ({
  values,
  onChange,
  allowCif = false,
  transports = [],
  submitting = false,
  submitLabel,
  onSubmit,
  onCancel,
}) => {
  const [sameWork, setSameWork] = useState(() => addressesMatch(values));
  const setField = (key, value) => onChange({ ...values, [key]: value });

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

  return (
    <div className="space-y-6">
      <div className="form-card">
        <p className="form-section-title">Datos de la empresa</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ed_empresa" label="Razón social">
            <input id="ed_empresa" className="input" value={values.empresa} onChange={(e) => setField("empresa", e.target.value)} maxLength={100} required />
          </Field>
          <Field id="ed_cif" label="CIF" hint={allowCif ? "Identificador de acceso de la empresa." : "El CIF no se puede modificar."}>
            <input id="ed_cif" className="input bg-gray-50" value={values.cif} readOnly={!allowCif} onChange={(e) => allowCif && setField("cif", e.target.value.toUpperCase())} maxLength={12} />
          </Field>
          <Field id="ed_tel" label="Teléfono empresa">
            <input id="ed_tel" className="input" value={values.telefonoEmpresa} onChange={(e) => setField("telefonoEmpresa", e.target.value)} maxLength={20} />
          </Field>
          <Field id="ed_email" label="Email empresa">
            <input id="ed_email" className="input" type="email" value={values.emailEmpresa} onChange={(e) => setField("emailEmpresa", e.target.value)} maxLength={100} />
          </Field>
          <Field id="ed_web" label="Web">
            <input id="ed_web" className="input" value={values.web} onChange={(e) => setField("web", e.target.value)} maxLength={150} />
          </Field>
          <Field id="ed_obs" label="Observaciones">
            <input id="ed_obs" className="input" value={values.observaciones} onChange={(e) => setField("observaciones", e.target.value)} maxLength={255} />
          </Field>
        </div>
      </div>

      <div className="form-card">
        <p className="form-section-title">Domicilio fiscal</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ed_dirL" label="Dirección">
            <input id="ed_dirL" className="input" value={values.domicilioLegal} onChange={(e) => setField("domicilioLegal", e.target.value)} maxLength={255} />
          </Field>
          <Field id="ed_munL" label="Municipio">
            <input id="ed_munL" className="input" value={values.municipioLegal} onChange={(e) => setField("municipioLegal", e.target.value)} maxLength={100} />
          </Field>
          <Field id="ed_locL" label="Localidad">
            <input id="ed_locL" className="input" value={values.localidadLegal} onChange={(e) => setField("localidadLegal", e.target.value)} maxLength={100} />
          </Field>
          <Field id="ed_provL" label="Provincia">
            <input id="ed_provL" className="input" value={values.provinciaLegal} onChange={(e) => setField("provinciaLegal", e.target.value)} maxLength={50} />
          </Field>
          <Field id="ed_cpL" label="Código postal">
            <input id="ed_cpL" className="input" value={values.cpLegal} onChange={(e) => setField("cpLegal", e.target.value)} maxLength={10} />
          </Field>
          <Field id="ed_telL" label="Teléfono">
            <input id="ed_telL" className="input" value={values.telefonoLegal} onChange={(e) => setField("telefonoLegal", e.target.value)} maxLength={20} />
          </Field>
          <Field id="ed_emL" label="Email">
            <input id="ed_emL" className="input" type="email" value={values.emailLegal} onChange={(e) => setField("emailLegal", e.target.value)} maxLength={100} />
          </Field>
        </div>
      </div>

      <div className="form-card">
        <p className="form-section-title">Lugar de trabajo</p>
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-brand-500" checked={sameWork} onChange={(e) => handleSameWork(e.target.checked)} />
          Coincide con el domicilio fiscal
        </label>
        {!sameWork && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="ed_dirT" label="Dirección">
              <input id="ed_dirT" className="input" value={values.domicilioTrabajo} onChange={(e) => setField("domicilioTrabajo", e.target.value)} maxLength={255} />
            </Field>
            <Field id="ed_munT" label="Municipio">
              <input id="ed_munT" className="input" value={values.municipioTrabajo} onChange={(e) => setField("municipioTrabajo", e.target.value)} maxLength={100} />
            </Field>
            <Field id="ed_locT" label="Localidad">
              <input id="ed_locT" className="input" value={values.localidadTrabajo} onChange={(e) => setField("localidadTrabajo", e.target.value)} maxLength={100} />
            </Field>
            <Field id="ed_provT" label="Provincia">
              <input id="ed_provT" className="input" value={values.provinciaTrabajo} onChange={(e) => setField("provinciaTrabajo", e.target.value)} maxLength={50} />
            </Field>
            <Field id="ed_cpT" label="Código postal">
              <input id="ed_cpT" className="input" value={values.cpTrabajo} onChange={(e) => setField("cpTrabajo", e.target.value)} maxLength={10} />
            </Field>
            <Field id="ed_telT" label="Teléfono">
              <input id="ed_telT" className="input" value={values.telefonoTrabajo} onChange={(e) => setField("telefonoTrabajo", e.target.value)} maxLength={20} />
            </Field>
            <Field id="ed_emT" label="Email">
              <input id="ed_emT" className="input" type="email" value={values.emailTrabajo} onChange={(e) => setField("emailTrabajo", e.target.value)} maxLength={100} />
            </Field>
          </div>
        )}
      </div>

      <div className="form-card">
        <p className="form-section-title">Responsable legal</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ed_nRep" label="Nombre">
            <input id="ed_nRep" className="input" value={values.nombreRepresentante} onChange={(e) => setField("nombreRepresentante", e.target.value)} maxLength={100} />
          </Field>
          <Field id="ed_dniRep" label="DNI / NIE">
            <input id="ed_dniRep" className="input" value={values.dniRepresentante} onChange={(e) => setField("dniRepresentante", e.target.value.toUpperCase())} maxLength={15} />
          </Field>
          <Field id="ed_cargoRep" label="Cargo">
            <input id="ed_cargoRep" className="input" value={values.cargoRepresentante} onChange={(e) => setField("cargoRepresentante", e.target.value)} maxLength={100} />
          </Field>
          <Field id="ed_telRep" label="Teléfono">
            <input id="ed_telRep" className="input" value={values.telefonoRepresentante} onChange={(e) => setField("telefonoRepresentante", e.target.value)} maxLength={20} />
          </Field>
          <Field id="ed_emRep" label="Email">
            <input id="ed_emRep" className="input" type="email" value={values.emailRepresentante} onChange={(e) => setField("emailRepresentante", e.target.value)} maxLength={100} />
          </Field>
        </div>
      </div>

      <div className="form-card">
        <p className="form-section-title">Coordinador dual</p>
        <p className="field-hint">El acceso al portal sigue siendo el CIF de la empresa, no este correo.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ed_nCoord" label="Nombre">
            <input id="ed_nCoord" className="input" value={values.nombreCoordinador} onChange={(e) => setField("nombreCoordinador", e.target.value)} maxLength={100} />
          </Field>
          <Field id="ed_dniCoord" label="DNI / NIE">
            <input id="ed_dniCoord" className="input" value={values.dniCoordinador} onChange={(e) => setField("dniCoordinador", e.target.value.toUpperCase())} maxLength={15} />
          </Field>
          <Field id="ed_cargoCoord" label="Cargo">
            <input id="ed_cargoCoord" className="input" value={values.cargoCoordinador} onChange={(e) => setField("cargoCoordinador", e.target.value)} maxLength={100} />
          </Field>
          <Field id="ed_telCoord" label="Teléfono">
            <input id="ed_telCoord" className="input" value={values.telefonoCoordinador} onChange={(e) => setField("telefonoCoordinador", e.target.value)} maxLength={20} />
          </Field>
          <Field id="ed_emCoord" label="Email">
            <input id="ed_emCoord" className="input" type="email" value={values.emailCoordinador} onChange={(e) => setField("emailCoordinador", e.target.value)} maxLength={100} />
          </Field>
        </div>
      </div>

      <div className="form-card">
        <p className="form-section-title">Puesto y transporte</p>
        <Field id="ed_desc" label="Descripción del puesto">
          <textarea id="ed_desc" className="textarea" value={values.descripcion_puesto} onChange={(e) => setField("descripcion_puesto", e.target.value)} maxLength={2000} />
        </Field>
        <TransportSelector
          dataTransports={transports}
          metodosTransporte={values.transportes}
          onToggle={(id) => {
            const n = Number(id);
            const next = values.transportes.includes(n)
              ? values.transportes.filter((t) => t !== n)
              : [...values.transportes, n];
            setField("transportes", next);
          }}
        />
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
          onClick={() => onSubmit(payload())}
        >
          {submitting ? "Enviando…" : submitLabel}
        </button>
      </div>
    </div>
  );
};

export default CompanyEditForm;
