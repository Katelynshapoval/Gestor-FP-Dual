import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as FormatValidation from "../../utils/formatValidation.js";
import { useFormMessage } from "../../hooks/useFormMessage.js";
import { postJSON } from "../../utils/api.js";
import SpecialitySelector from "./SpecialitySelector.jsx";
import TransportSelector from "./TransportSelector.jsx";
import FormMessage from "../../components/ui/FormMessage.jsx";
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
  const { message, showMessage } = useFormMessage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef(null);

  const [dataSpecialities, setDataSpecialities] = useState([]);
  const [dataTransports, setDataTransports] = useState([]);

  const [emailCoordinador, setEmailCoordinador] = useState("");
  const [nombreCoordinador, setNombreCoordinador] = useState("");
  const [telefonoCoordinador, setTelefonoCoordinador] = useState("");
  const [dniCoordinador] = useState("");

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
  const [emailRepresentante] = useState("");
  const [telefonoRepresentante] = useState("");

  const [specialities, setSpecialities] = useState([[], []]);
  const [descripcionPuesto, setDescripcionPuesto] = useState("");
  const [direccionLugarTrabajo, setDireccionLugarTrabajo] = useState("");
  const [metodosTransporte, setMetodosTransporte] = useState([]);

  const [passwordCoordinador, setPasswordCoordinador] = useState("");

  useEffect(() => {
    fetch("/especialidades")
      .then((r) => r.json())
      .then(setDataSpecialities)
      .catch(console.error);

    fetch("/transportes")
      .then((r) => r.json())
      .then(setDataTransports)
      .catch(console.error);
  }, []);

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

    if (!FormatValidation.dniNieValido(dniRl)) {
      await showMessage("DNI/NIE del responsable legal no válido.");
      setIsSubmitting(false);
      return;
    }
    if (!FormatValidation.cifValido(cif)) {
      await showMessage("CIF de la empresa no válido.");
      setIsSubmitting(false);
      return;
    }
    if (specialities[0].length === 0) {
      await showMessage("Selecciona al menos un ciclo de grado.");
      setIsSubmitting(false);
      return;
    }
    if (specialities[1].some((c) => c <= 0)) {
      await showMessage("Indica al menos un alumno por grado.");
      setIsSubmitting(false);
      return;
    }
    if (!passwordCoordinador || passwordCoordinador.length < 8) {
      await showMessage("La contraseña del coordinador debe tener al menos 8 caracteres.");
      setIsSubmitting(false);
      return;
    }

    try {
      const especialidades = specialities[0].map((id, i) => ({
        idEspecialidad: id,
        cantidadAlumnos: specialities[1][i],
      }));

      await postJSON("/solicitudes/empresa", {
        cif: cif.toUpperCase(),
        empresa: razonSocial,
        telefonoEmpresa: telEmpresa,
        domicilioLegal: dirRazSocial,
        cpLegal: cpRazSoc,
        provinciaLegal: provincia,
        localidadLegal: municipio || provincia,
        municipioLegal: municipio,
        // use legal address as work address when no separate address is given
        mismoLugarTrabajo: !direccionLugarTrabajo,
        domicilioTrabajo: direccionLugarTrabajo || dirRazSocial,
        cpTrabajo: cpRazSoc,
        provinciaTrabajo: provincia,
        localidadTrabajo: municipio || provincia,
        dniRepresentante: dniRl,
        nombreRepresentante: responsableLegal,
        emailRepresentante: emailRepresentante || emailCoordinador,
        telefonoRepresentante: telefonoRepresentante || telEmpresa,
        cargoRepresentante: cargo || "REPRESENTANTE LEGAL",
        dniCoordinador: dniCoordinador || dniRl,
        nombreCoordinador,
        emailCoordinador,
        telefonoCoordinador,
        cargoCoordinador: "COORDINADOR DUAL",
        descripcion_puesto: descripcionPuesto,
        especialidades,
        transportes: metodosTransporte,
        passwordCoordinador,
      });

      await showMessage("La solicitud se ha enviado correctamente.");
      setTimeout(() => navigate("/"), 1200);
    } catch (err) {
      await showMessage(err.message || "Error al procesar la solicitud. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container px-8">
      <h1 className="page-title">Solicitud de empresa colaboradora</h1>
      <p className="page-subtitle">
        Esta petición no tiene vinculación legal. Es el primer paso para
        formalizar la documentación del programa dual.
      </p>

      <form ref={formRef} className="space-y-6">
        {/* Coordinator section */}
        <div className="form-card">
          <div className="form-section-title">Datos del coordinador</div>
          <p className="field-hint">
            <strong>Importante:</strong> Esta persona recibirá todas las
            notificaciones y documentos del proyecto DUAL.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="eCoord" label="Email coordinador">
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
            <Field id="nCoord" label="Nombre coordinador">
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
            <Field id="tCoord" label="Teléfono coordinador">
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
          <Field id="pwdCoord" label="Contraseña inicial (acceso al panel)">
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
              />
            </Field>
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">Responsable Legal</div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="rl" label="Nombre responsable legal">
              <input
                id="rl"
                className="input"
                value={responsableLegal}
                placeholder="Nombre completo"
                onChange={(e) => setResponsableLegal(e.target.value)}
                maxLength={100}
              />
            </Field>
            <Field id="dniRlF" label="DNI responsable">
              <input
                id="dniRlF"
                className="input"
                value={dniRl}
                onChange={(e) => setDniRl(e.target.value)}
                pattern="[A-Z0-9]{9,10}"
                maxLength={15}
                placeholder="ej. 12345678A"
              />
            </Field>
            <Field id="cargo" label="Cargo">
              <input
                id="cargo"
                className="input"
                value={cargo}
                placeholder="Cargo en la empresa"
                onChange={(e) => setCargo(e.target.value)}
                maxLength={100}
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
              />
            </Field>
            <Field id="dirTrab" label="Dirección del lugar de trabajo">
              <input
                id="dirTrab"
                className="input"
                value={direccionLugarTrabajo}
                placeholder="Deja en blanco si coincide con la dirección fiscal"
                onChange={(e) => setDireccionLugarTrabajo(e.target.value)}
                maxLength={255}
              />
            </Field>
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

        <FormMessage message={message} />
      </form>
    </div>
  );
};

export default AddCompanyRequest;
