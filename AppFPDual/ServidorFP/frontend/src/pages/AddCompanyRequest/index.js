import { useState, useEffect, useRef } from 'react';
import * as FormatValidation from '../../functions/FormatValidation.js';
import { useFormMessage } from '../../hooks/useFormMessage.js';
import { postForm } from '../../utils/api.js';
import SpecialitySelector from './SpecialitySelector.jsx';
import TransportSelector from './TransportSelector.jsx';
import FormMessage from '../../components/ui/FormMessage.jsx';

// PÁGINA para que las empresas envíen una solicitud de participación en FP Dual.
const AddCompanyRequest = () => {
  const { message, showMessage } = useFormMessage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef(null);
  const [dataSpecialities, setDataSpecialities] = useState([]);
  const [dataTransports, setDataTransports] = useState([]);
  const [emailCoordinador, setEmailCoordinador] = useState('');
  const [nombreCoordinador, setNombreCoordinador] = useState('');
  const [telefonoCoordinador, setTelefonoCoordinador] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [cif, setCif] = useState('');
  const [telEmpresa, setTelEmpresa] = useState('');
  const [dirRazSocial, setDirRazSocial] = useState('');
  const [provincia, setProvincia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [cpRazSoc, setCpRazSoc] = useState('');
  const [responsableLegal, setResponsableLegal] = useState('');
  const [cargo, setCargo] = useState('');
  const [dniRl, setDniRl] = useState('');
  const [specialities, setSpecialities] = useState([[], []]);
  const [descripcionPuesto, setDescripcionPuesto] = useState('');
  const [direccionLugarTrabajo, setDireccionLugarTrabajo] = useState('');
  const [metodosTransporte, setMetodosTransporte] = useState([]);

  useEffect(() => {
    fetch('/getAllSpecialities').then(r=>r.json()).then(setDataSpecialities).catch(console.error);
    fetch('/getAllPossibleTransports').then(r=>r.json()).then(setDataTransports).catch(console.error);
  }, []);

  const handleTransportToggle = (id) =>
    setMetodosTransporte(prev => prev.includes(id) ? prev.filter(t=>t!==id) : [...prev, id]);

  const handleSpecialityToggle = (id) =>
    setSpecialities(([ids, amounts]) => {
      const idx = ids.indexOf(id);
      if (idx === -1) return [[...ids, id], [...amounts, 0]];
      return [ids.filter((_,i)=>i!==idx), amounts.filter((_,i)=>i!==idx)];
    });

  const handleAmountChange = (id, newCount) =>
    setSpecialities(([ids, amounts]) => {
      const idx = ids.indexOf(id); if (idx===-1) return [ids, amounts];
      const a = [...amounts]; a[idx] = newCount; return [ids, a];
    });

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (!formRef.current.checkValidity()) { formRef.current.reportValidity(); setIsSubmitting(false); return; }
    if (!FormatValidation.dniNieValido(dniRl)) { await showMessage('DNI/NIE del responsable legal no válido.'); setIsSubmitting(false); return; }
    if (!FormatValidation.cifValido(cif)) { await showMessage('CIF de la empresa no válido.'); setIsSubmitting(false); return; }
    if (specialities[0].length === 0) { await showMessage('Selecciona al menos un ciclo de grado.'); setIsSubmitting(false); return; }
    if (specialities[1].some(c=>c<=0)) { await showMessage('Indica al menos un alumno por grado.'); setIsSubmitting(false); return; }
    try {
      const data = new FormData();
      [['emailCoordinador',emailCoordinador],['nombreCoordinador',nombreCoordinador],
       ['telefonoCoordinador',telefonoCoordinador],['razonSocial',razonSocial],['cif',cif],
       ['telEmpresa',telEmpresa],['dirRazSocial',dirRazSocial],['provincia',provincia],
       ['municipio',municipio],['cpRazSoc',cpRazSoc],['responsableLegal',responsableLegal],
       ['cargo',cargo],['dniRl',dniRl],['descripcionPuesto',descripcionPuesto],
       ['direccionLugarTrabajo',direccionLugarTrabajo],['metodosTransporte',metodosTransporte],
       ['fechaPeticion',FormatValidation.validDate(new Date())],
       ['specialities',JSON.stringify(specialities)],['url',window.location.origin]
      ].forEach(([k,v]) => data.append(k,v));
      await postForm('/addCompanyRequest', data);
      await showMessage('La solicitud se ha enviado correctamente.');
    } catch { await showMessage('Error al procesar la solicitud. Inténtalo de nuevo.'); }
    finally { setIsSubmitting(false); }
  };

  const Field = ({ id, label, hint, children }) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="field-hint" dangerouslySetInnerHTML={{ __html: hint }} />}
      {children}
    </div>
  );

  return (
    <div className="page-container">
      <h1 className="page-title">Solicitud de empresa colaboradora</h1>
      <p className="page-subtitle">
        Esta petición no tiene vinculación legal. Es el primer paso para formalizar la documentación del programa dual.
      </p>
      <form ref={formRef}>

        <div className="form-card">
          <div className="form-section-title">Datos del coordinador</div>
          <p className="field-hint"><strong>Importante:</strong> Esta persona recibirá todas las notificaciones y documentos del proyecto DUAL.</p>
          <div className="grid-3">
            <Field id="eCoord" label="Email coordinador">
              <input id="eCoord" className="input" type="email" value={emailCoordinador}
                onChange={e=>setEmailCoordinador(e.target.value)} maxLength={60} required />
            </Field>
            <Field id="nCoord" label="Nombre coordinador">
              <input id="nCoord" className="input" value={nombreCoordinador}
                onChange={e=>setNombreCoordinador(e.target.value)} maxLength={45} required />
            </Field>
            <Field id="tCoord" label="Teléfono coordinador">
              <input id="tCoord" className="input" value={telefonoCoordinador}
                onChange={e=>setTelefonoCoordinador(e.target.value)} maxLength={9} required />
            </Field>
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">Datos de la empresa</div>
          <div className="grid-2">
            <Field id="rs" label="Razón Social">
              <input id="rs" className="input" value={razonSocial} onChange={e=>setRazonSocial(e.target.value)} maxLength={60} required />
            </Field>
            <Field id="cifF" label="CIF">
              <input id="cifF" className="input" value={cif} onChange={e=>setCif(e.target.value)}
                maxLength={9} pattern="^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$" required />
            </Field>
            <Field id="telEmp" label="Teléfono empresa">
              <input id="telEmp" className="input" value={telEmpresa} onChange={e=>setTelEmpresa(e.target.value)} maxLength={9} />
            </Field>
            <Field id="dirRS" label="Dirección Razón Social">
              <input id="dirRS" className="input" value={dirRazSocial} onChange={e=>setDirRazSocial(e.target.value)} maxLength={100} />
            </Field>
            <Field id="mun" label="Municipio">
              <input id="mun" className="input" value={municipio} onChange={e=>setMunicipio(e.target.value)} maxLength={40} />
            </Field>
            <Field id="prov" label="Provincia">
              <input id="prov" className="input" value={provincia} onChange={e=>setProvincia(e.target.value)} maxLength={40} />
            </Field>
            <Field id="cp" label="Código Postal">
              <input id="cp" className="input" value={cpRazSoc} onChange={e=>setCpRazSoc(e.target.value)} maxLength={5} />
            </Field>
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">Responsable Legal</div>
          <div className="grid-3">
            <Field id="rl" label="Nombre responsable legal">
              <input id="rl" className="input" value={responsableLegal} onChange={e=>setResponsableLegal(e.target.value)} maxLength={45} />
            </Field>
            <Field id="dniRlF" label="DNI responsable">
              <input id="dniRlF" className="input" value={dniRl} onChange={e=>setDniRl(e.target.value)} pattern="[A-Z0-9]{9,10}" maxLength={10} />
            </Field>
            <Field id="cargo" label="Cargo">
              <input id="cargo" className="input" value={cargo} onChange={e=>setCargo(e.target.value)} maxLength={30} />
            </Field>
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">Puesto de trabajo</div>
          <Field id="descP" label="Descripción del puesto">
            <p className="field-hint">Indica las tareas que se le asignarán al estudiante. Ayuda a realizar una mejor preselección.</p>
            <textarea id="descP" className="textarea" value={descripcionPuesto}
              onChange={e=>setDescripcionPuesto(e.target.value)} maxLength={500} />
          </Field>
          <Field id="dirTrab" label="Dirección del lugar de trabajo">
            <input id="dirTrab" className="input" value={direccionLugarTrabajo}
              onChange={e=>setDireccionLugarTrabajo(e.target.value)} maxLength={100} />
          </Field>
          <SpecialitySelector dataSpecialities={dataSpecialities} specialities={specialities}
            onToggle={handleSpecialityToggle} onAmountChange={handleAmountChange} />
          <TransportSelector dataTransports={dataTransports} metodosTransporte={metodosTransporte}
            onToggle={handleTransportToggle} />
        </div>

        <button type="button" className={`btn btn-primary ${isSubmitting ? 'btn-disabled' : ''}`}
          onClick={handleSubmit} disabled={isSubmitting} style={{ marginTop: '.5rem' }}>
          {isSubmitting ? 'Enviando...' : 'Enviar solicitud'}
        </button>
        <FormMessage message={message} />
      </form>
    </div>
  );
};

export default AddCompanyRequest;
