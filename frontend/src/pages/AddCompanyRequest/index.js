import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as FormatValidation from "../../utils/formatValidation.js";
import { getJSON, postJSON } from "../../utils/api.js";
import SpecialitySelector from "./SpecialitySelector.jsx";
import TransportSelector from "./TransportSelector.jsx";
import FormMessage from "../../components/ui/FormMessage.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";
import "../../styles/forms.css";

const Field = ({ id, label, hint, children }) => (
  <div className="field">
    <label htmlFor={id}>{label}</label>
    {hint && (
      <p className="field-hint" dangerouslySetInnerHTML={{ __html: hint }} />
    )}
    {children}
  </div>
);

// Company application page for joining the Dual programme
const AddCompanyRequest = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [validation, setValidation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef(null);

  const [dataSpecialities, setDataSpecialities] = useState([]);
  const [dataTransports, setDataTransports] = useState([]);

  const [emailCoordinador, setEmailCoordinador] = useState("");
  const [nombreCoordinador, setNombreCoordinador] = useState("");
  const [telefonoCoordinador, setTelefonoCoordinador] = useState("");
  const [dniCoordinador, setDniCoordinador] = useState("");

  const [razonSocial, setRazonSocial] = useState("");
  const [cif, setCif] = useState("");
  const [telEmpresa, setTelEmpresa] = useState("");

  const [dirRazSocial, setDirRazSocial] = useState("");
  const [provincia, setProvincia] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [cpRazSoc, setCpRazSoc] = useState("");

  const [responsableLegal, setResponsableLegal] = useState("");
  const [cargo, setCargo] = useState("");
  const [dniRl, setDniRl] = useState("");
  const [emailRepresentante, setEmailRepresentante] = useState("");
  const [telefonoRepresentante, setTelefonoRepresentante] = useState("");

  const [specialities, setSpecialities] = useState([[], []]);
  const [descripcionPuesto, setDescripcionPuesto] = useState("");
  // WF-12: the work address is either the legal address or its own full address.
  const [mismoLugarTrabajo, setMismoLugarTrabajo] = useState(true);
  const [direccionLugarTrabajo, setDireccionLugarTrabajo] = useState("");
  const [cpTrabajo, setCpTrabajo] = useState("");
  const [municipioTrabajo, setMunicipioTrabajo] = useState("");
  const [provinciaTrabajo, setProvinciaTrabajo] = useState("");
  const [metodosTransporte, setMetodosTransporte] = useState([]);

  const [passwordCoordinador, setPasswordCoordinador] = useState("");

  const [catalogError, setCatalogError] = useState("");
  const [catalogToken, setCatalogToken] = useState(0);

  useEffect(() => {
    setCatalogError("");
    Promise.all([getJSON("/especialidades"), getJSON("/transportes")])
      .then(([esp, tra]) => {
        setDataSpecialities(Array.isArray(esp) ? esp : []);
        setDataTransports(Array.isArray(tra) ? tra : []);
      })
      .catch((err) => setCatalogError(err.message || "No se pudieron cargar los ciclos y transportes."));
  }, [catalogToken]);

  const handleTransportToggle = (id) => {
    setMetodosTransporte((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const handleSpecialityToggle = (id) => {
    setSpecialities(([ids, amounts]) => {
      const idx = ids.indexOf(id);
      if (idx === -1) return [[...ids, id], [...amounts, 0]];
      return [ids.filter((_, i) => i !== idx), amounts.filter((_, i) => i !== idx)];
    });
  };

  const handleAmountChange = (id, newCount) => {
    setSpecialities(([ids, amounts]) => {
      const idx = ids.indexOf(id);
      if (idx === -1) return [ids, amounts];
      const newAmounts = [...amounts];
      newAmounts[idx] = newCount;
      return [ids, newAmounts];
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (!formRef.current.checkValidity()) {
      formRef.current.reportValidity();
      setIsSubmitting(false);
      return;
    }

    if (!FormatValidation.dniNieValido(dniRl.trim().toUpperCase())) {
      setValidation("DNI/NIE del responsable legal no válido.");
      setIsSubmitting(false);
      return;
    }
    if (!FormatValidation.dniNieValido(dniCoordinador.trim().toUpperCase())) {
      setValidation("DNI/NIE del coordinador principal no válido.");
      setIsSubmitting(false);
      return;
    }
    if (!FormatValidation.cifValido(cif)) {
      setValidation("CIF de la empresa no válido.");
      setIsSubmitting(false);
      return;
    }
    if (specialities[0].length === 0) {
      setValidation("Selecciona al menos un ciclo de grado.");
      setIsSubmitting(false);
      return;
    }
    if (specialities[1].some((c) => c <= 0)) {
      setValidation("Indica al menos un alumno por grado.");
      setIsSubmitting(false);
      return;
    }
    if (!passwordCoordinador || passwordCoordinador.length < 8) {
      setValidation("La contraseña del coordinador debe tener al menos 8 caracteres.");
      setIsSubmitting(false);
      return;
    }
    setValidation("");

    try {
      const especialidades = specialities[0].map((id, i) => ({
        idEspecialidad: id,
        cantidadAlumnos: specialities[1][i],
      }));

      await postJSON("/solicitudes/empresa", {
        cif: cif.trim().toUpperCase(),
        empresa: razonSocial,
        telefonoEmpresa: telEmpresa,
        domicilioLegal: dirRazSocial,
        cpLegal: cpRazSoc,
        provinciaLegal: provincia,
        localidadLegal: municipio,
        municipioLegal: municipio,
        // WF-12: only what the company entered is stored. With
        // mismoLugarTrabajo the backend reuses the legal address record.
        mismoLugarTrabajo,
        ...(mismoLugarTrabajo
          ? {}
          : {
              domicilioTrabajo: direccionLugarTrabajo,
              cpTrabajo,
              provinciaTrabajo,
              localidadTrabajo: municipioTrabajo,
              municipioTrabajo,
            }),
        dniRepresentante: dniRl.trim().toUpperCase(),
        nombreRepresentante: responsableLegal,
        emailRepresentante,
        telefonoRepresentante,
        cargoRepresentante: cargo,
        dniCoordinador: dniCoordinador.trim().toUpperCase(),
        nombreCoordinador,
        emailCoordinador,
        telefonoCoordinador,
        cargoCoordinador: "COORDINADOR DUAL",
        descripcion_puesto: descripcionPuesto,
        especialidades,
        transportes: metodosTransporte,
        passwordCoordinador,
      });

      toast.success("La solicitud se ha enviado correctamente.");
      navigate("/");
    } catch (err) {
      toast.error(err.message || "Error al procesar la solicitud. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        kicker="Empresas"
        title="Solicitud de empresa colaboradora"
        subtitle="Esta petición no tiene vinculación legal. Es el primer paso para formalizar la documentación del programa dual."
      />

      <form ref={formRef} className="space-y-6">
        {/* Coordinator section */}
        <div className="form-card">
          <div className="form-section-title">Coordinador principal</div>
          <p className="field-hint">
            <strong>Importante:</strong> Esta persona recibirá las notificaciones
            y documentos del proyecto DUAL y será el contacto de acceso al portal
            (CIF). También se registrará como primer tutor de la empresa; podréis
            añadir más tutores después desde el portal.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field id="dniCoord" label="DNI/NIE coordinador principal">
              <input
                id="dniCoord"
                className="input"
                value={dniCoordinador}
                placeholder="ej. 12345678Z"
                onChange={(e) => setDniCoordinador(e.target.value)}
                maxLength={15}
                autoComplete="off"
                required
              />
            </Field>
            <Field id="eCoord" label="Email coordinador principal">
              <input
                id="eCoord"
                className="input"
                type="email"
                value={emailCoordinador}
                placeholder="ej. coordinador@empresa.com"
                onChange={(e) => setEmailCoordinador(e.target.value)}
                maxLength={100}
                required
              />
            </Field>
            <Field id="nCoord" label="Nombre coordinador principal">
              <input
                id="nCoord"
                className="input"
                value={nombreCoordinador}
                placeholder="Nombre completo"
                onChange={(e) => setNombreCoordinador(e.target.value)}
                maxLength={100}
                required
              />
            </Field>
            <Field id="tCoord" label="Teléfono coordinador principal">
              <input
                id="tCoord"
                className="input"
                value={telefonoCoordinador}
                placeholder="ej. 600123456"
                onChange={(e) => setTelefonoCoordinador(e.target.value)}
                maxLength={50}
                required
              />
            </Field>
          </div>
          <Field id="pwdCoord" label="Contraseña inicial (acceso con el CIF de la empresa)">
            <p className="field-hint">
              El coordinador principal accede al panel con el CIF de la empresa, no con su correo electrónico.
            </p>
            <input
              id="pwdCoord"
              className="input"
              type="password"
              value={passwordCoordinador}
              onChange={(e) => setPasswordCoordinador(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              minLength={8}
              maxLength={100}
              required
            />
          </Field>
        </div>

        {/* Company info section */}
        <div className="form-card">
          <div className="form-section-title">Datos de la empresa</div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="rs" label="Razón Social">
              <input
                id="rs"
                className="input"
                placeholder="Nombre legal de la empresa"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                maxLength={100}
                required
              />
            </Field>
            <Field id="cifF" label="CIF">
              <input
                id="cifF"
                className="input"
                placeholder="ej. B12345678"
                value={cif}
                onChange={(e) => setCif(e.target.value)}
                maxLength={12}
                pattern="^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$"
                required
              />
            </Field>
            <Field id="telEmp" label="Teléfono empresa">
              <input
                id="telEmp"
                placeholder="ej. 976123456"
                className="input"
                value={telEmpresa}
                onChange={(e) => setTelEmpresa(e.target.value)}
                maxLength={20}
              />
            </Field>
            <Field id="dirRS" label="Dirección Razón Social">
              <input
                id="dirRS"
                className="input"
                value={dirRazSocial}
                onChange={(e) => setDirRazSocial(e.target.value)}
                maxLength={255}
                placeholder="Dirección fiscal de la empresa"
                required
              />
            </Field>
            <Field id="mun" label="Municipio">
              <input
                id="mun"
                className="input"
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
                placeholder="Municipio"
                maxLength={100}
                required
              />
            </Field>
            <Field id="prov" label="Provincia">
              <input
                id="prov"
                className="input"
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                placeholder="Provincia"
                maxLength={50}
                required
              />
            </Field>
            <Field id="cp" label="Código Postal">
              <input
                id="cp"
                className="input"
                value={cpRazSoc}
                placeholder="ej. 50010"
                onChange={(e) => setCpRazSoc(e.target.value)}
                maxLength={10}
                required
              />
            </Field>
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">Responsable Legal</div>
          <p className="field-hint">Persona que firma el convenio en nombre de la empresa.</p>
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="rl" label="Nombre responsable legal">
              <input
                id="rl"
                className="input"
                value={responsableLegal}
                placeholder="Nombre completo"
                onChange={(e) => setResponsableLegal(e.target.value)}
                maxLength={100}
                required
              />
            </Field>
            <Field id="dniRlF" label="DNI responsable">
              <input
                id="dniRlF"
                className="input"
                value={dniRl}
                onChange={(e) => setDniRl(e.target.value)}
                maxLength={15}
                placeholder="ej. 12345678Z"
                autoComplete="off"
                required
              />
            </Field>
            <Field id="cargo" label="Cargo">
              <input
                id="cargo"
                className="input"
                value={cargo}
                placeholder="ej. Administrador único"
                onChange={(e) => setCargo(e.target.value)}
                maxLength={100}
                required
              />
            </Field>
            <Field id="emailRl" label="Email responsable legal">
              <input
                id="emailRl"
                type="email"
                className="input"
                value={emailRepresentante}
                placeholder="ej. direccion@empresa.com"
                onChange={(e) => setEmailRepresentante(e.target.value)}
                maxLength={100}
                required
              />
            </Field>
            <Field id="telRl" label="Teléfono responsable legal">
              <input
                id="telRl"
                className="input"
                value={telefonoRepresentante}
                placeholder="ej. 976123456"
                onChange={(e) => setTelefonoRepresentante(e.target.value)}
                maxLength={50}
                required
              />
            </Field>
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">Puesto de trabajo</div>
          <div className="space-y-10">
            <Field id="descP" label="Descripción del puesto">
              <p className="field-hint">
                Indica las tareas que se le asignarán al estudiante.
              </p>
              <textarea
                id="descP"
                className="textarea"
                placeholder="Describe brevemente las tareas que realizará el alumno"
                value={descripcionPuesto}
                onChange={(e) => setDescripcionPuesto(e.target.value)}
                maxLength={500}
                required
              />
            </Field>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-charcoal-900">Lugar de trabajo</legend>
              <label className="flex items-center gap-2 text-sm text-charcoal-800">
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  checked={mismoLugarTrabajo}
                  onChange={(e) => setMismoLugarTrabajo(e.target.checked)}
                />
                El alumno trabajará en la dirección fiscal de la empresa
              </label>
              {!mismoLugarTrabajo && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field id="dirTrab" label="Dirección del lugar de trabajo">
                    <input
                      id="dirTrab"
                      className="input"
                      value={direccionLugarTrabajo}
                      placeholder="Calle, número…"
                      onChange={(e) => setDireccionLugarTrabajo(e.target.value)}
                      maxLength={255}
                      required
                    />
                  </Field>
                  <Field id="munTrab" label="Municipio del lugar de trabajo">
                    <input
                      id="munTrab"
                      className="input"
                      value={municipioTrabajo}
                      onChange={(e) => setMunicipioTrabajo(e.target.value)}
                      maxLength={100}
                      required
                    />
                  </Field>
                  <Field id="provTrab" label="Provincia del lugar de trabajo">
                    <input
                      id="provTrab"
                      className="input"
                      value={provinciaTrabajo}
                      onChange={(e) => setProvinciaTrabajo(e.target.value)}
                      maxLength={50}
                      required
                    />
                  </Field>
                  <Field id="cpTrab" label="Código postal del lugar de trabajo">
                    <input
                      id="cpTrab"
                      className="input"
                      value={cpTrabajo}
                      placeholder="ej. 50010"
                      onChange={(e) => setCpTrabajo(e.target.value)}
                      maxLength={10}
                      required
                    />
                  </Field>
                </div>
              )}
            </fieldset>
            {catalogError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {catalogError}{" "}
                <button type="button" className="font-semibold underline" onClick={() => setCatalogToken((n) => n + 1)}>
                  Reintentar
                </button>
              </div>
            )}
            <SpecialitySelector
              dataSpecialities={dataSpecialities}
              specialities={specialities}
              onToggle={handleSpecialityToggle}
              onAmountChange={handleAmountChange}
            />
            <TransportSelector
              dataTransports={dataTransports}
              metodosTransporte={metodosTransporte}
              onToggle={handleTransportToggle}
            />
          </div>
        </div>

        <button
          type="button"
          className={`btn btn-primary mt-2 mx-auto block ${
            isSubmitting ? "btn-disabled" : ""
          }`}
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Enviando..." : "Enviar solicitud"}
        </button>

        <FormMessage message={validation} tone="error" />
      </form>
    </div>
  );
};

export default AddCompanyRequest;
