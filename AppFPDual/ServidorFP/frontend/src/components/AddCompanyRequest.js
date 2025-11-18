import { useState, useEffect, useRef } from 'react';
import * as FormatValidation from '../functions/FormatValidation.js';

const AddCompanyRequest = () => {
  // Estado para almacenar el mensaje de éxito
  const [successMessage, setSuccessMessage] = useState("");
  // Para cargar las especialidades 
  const [dataSpecialities, setDataSpecialities] = useState([]);
  // Para cargar los posibles transportes 
  const [dataTransports, setDataTransports] = useState([]);
  // Para evitar multiples envíos seguidos
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Campos form
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
  // Para validación del form
  const formRef = useRef(null);
  // Para crear mensajes que aparecen y desaparecen al tiempo
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// ----------------------------------------------------------------   USE EFFECTS
  useEffect(() => {
    GetAllSpecialities();
    GetAllTransports();
  }, []);

// -----------------------------------------------------------------   GET ALLS
// 
// Recoge todos los datos de la tabla especialidades y los guarda en dataSpecialities
  function GetAllSpecialities() {
    fetch('/getAllSpecialities') // Hacer una solicitud HTTP GET a '/getAllSpecialities'
      .then(response => response.json()) // Convertir la respuesta a JSON
      .then(dataSpecialities => {
        setDataSpecialities(dataSpecialities); // Establecer los datos obtenidos en el estado 'dataSpecialities'
        console.log(dataSpecialities); // Mostrar el contenido en la consola
      })
      .catch(error => {
        console.error('Error fetching specialities data:', error);
      });
  }

// Recoge todos los datos de la tabla possibleTransporta y los guarda en dataTransports
  function GetAllTransports() {
    fetch('/getAllPossibleTransports') // Hacer una solicitud HTTP GET a '/getAllPossibleTransports'
      .then(response => response.json()) // Convertir la respuesta a JSON
      .then(dataTransports => {
        setDataTransports(dataTransports); // Establecer los datos obtenidos en el estado 'dataTransports'
        console.log(dataTransports); // Mostrar el contenido en la consola
      })
      .catch(error => {
        console.error('Error fetching specialities data:', error);
      });
  }

// -----------------------------------------------------------------   HANDLERS
// 
  const handleTransportToggle = (id) => {
    const index = metodosTransporte.indexOf(id);
    if (index === -1) {
      // Los ... representan todo el array de datos, al que le sumo el id
      setMetodosTransporte([...metodosTransporte, id]);
    } else {
      const newIds = [...metodosTransporte];
      // No puedo hacer splice directamente en metodosTransporte
      // ya que React no lo interpretaría como cambio
      newIds.splice(index, 1);
      setMetodosTransporte(newIds);
    }
    console.log(metodosTransporte);
  };

  const handleSpecialityToggle = (id) => {
    const index = specialities[0].indexOf(id);
    if (index === -1) {
      // Los ... representan todo el array de datos, al que le sumo id y 0
      setSpecialities([[...specialities[0], id], [...specialities[1], 0]]);
    } else {
      const newIds = [...specialities[0]];
      const newAmounts = [...specialities[1]];
      // No puedo hacer splice directamente en specialities[0] y specialities[1] 
      // ya que React no lo interpretaría como cambio
      newIds.splice(index, 1);
      newAmounts.splice(index, 1);
      setSpecialities([newIds, newAmounts]);
    }
    console.log(specialities);
  };

  const handleAmmountChange = (id, newCount) => {
    const index = specialities[0].indexOf(id);
    if (index !== -1) {
      const newAmounts = [...specialities[1]];
      newAmounts[index] = newCount; // React necesita que hagas tablas nuevas o no detecta cambios en tablas.
      setSpecialities([specialities[0], newAmounts]);
    }
    console.log(specialities);
  };

  function handleEmailCoordinadorChange(event) {
    setEmailCoordinador(event.target.value);
  }

  function handleNombreCoordinadorChange(event) {
    setNombreCoordinador(event.target.value);
  }

  function handleTelefonoCoordinadorChange(event) {
    setTelefonoCoordinador(event.target.value);
  }

  function handleRazonSocialChange(event) {
    setRazonSocial(event.target.value);
  }

  function handleCifChange(event) {
    setCif(event.target.value);
  }

  function handleTelEmpresaChange(event) {
    setTelEmpresa(event.target.value);
  }

  function handleDirRazSocialChange(event) {
    setDirRazSocial(event.target.value);
  }

  function handleProvinciaChange(event) {
    setProvincia(event.target.value);
  }

  function handleMunicipioChange(event) {
    setMunicipio(event.target.value);
  }

  function handleCpRazSocChange(event) {
    setCpRazSoc(event.target.value);
  }

  function handleResponsableLegalChange(event) {
    setResponsableLegal(event.target.value);
  }

  function handleCargoChange(event) {
    setCargo(event.target.value);
  }

  function handleDniRlChange(event) {
    setDniRl(event.target.value);
  }

  function handleDescripcionPuestoChange(event) {
    setDescripcionPuesto(event.target.value);
  }

  function handleDireccionLugarTrabajoChange(event) {
    setDireccionLugarTrabajo(event.target.value);
  }

// --------------------------------------------------------------------------  EJECUCIONES
  const buttonAddCompanyRequest = async () => {
    // Si hay petición en proceso, evita que mande otra.
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (!formRef.current.checkValidity()) {
      formRef.current.reportValidity();
      setIsSubmitting(false);
      return;
    }
    if (!FormatValidation.dniNieValido(dniRl)){
      setIsSubmitting(false);
      setSuccessMessage("Formato de DNI/NIE del responsable legal no valido, porfavor revise el campo.");
      await wait(5000);
      setSuccessMessage(null);
      return;
    }
    if (!FormatValidation.cifValido(cif)){
      setIsSubmitting(false);
      setSuccessMessage("Formato del CIF de la empresa no valido, porfavor revise el campo.");
      await wait(5000);
      setSuccessMessage(null);
      return;
    }
    if (specialities.length === 0) {
      setIsSubmitting(false);
        setSuccessMessage("Por favor, selecciona al menos un ciclo de grado.");
        await wait(5000);
        setSuccessMessage(null);
        return;
    }
    for (let i = 0; i < specialities.length; i++) {
      if (specialities[1][i] <= 0){
      setIsSubmitting(false);
        setSuccessMessage("Por favor, selecciona al menos un alumno para cada grado escogido.");
        await wait(5000);
        setSuccessMessage(null);
        return;
      }
    }
    await AddCompanyRequest();
  };

  const AddCompanyRequest = async () => {
    try {
      const data = new FormData();
      data.append('emailCoordinador', emailCoordinador);
      data.append('nombreCoordinador', nombreCoordinador);
      data.append('telefonoCoordinador', telefonoCoordinador);
      data.append('razonSocial', razonSocial);
      data.append('cif', cif);
      data.append('telEmpresa', telEmpresa);
      data.append('dirRazSocial', dirRazSocial);
      data.append('provincia', provincia);
      data.append('municipio', municipio);
      data.append('cpRazSoc', cpRazSoc);
      data.append('responsableLegal', responsableLegal);
      data.append('cargo', cargo);
      data.append('dniRl', dniRl);
      data.append('descripcionPuesto', descripcionPuesto);
      data.append('direccionLugarTrabajo', direccionLugarTrabajo);
      data.append('metodosTransporte', metodosTransporte);
      data.append('fechaPeticion', FormatValidation.validDate(new Date()));
      data.append('specialities', JSON.stringify(specialities));
      data.append('url', window.location.origin);

      const options = {
        method: 'POST',
        body: data,
      };

      const response = await fetch("/addCompanyRequest", options);
      if (!response.ok) {
        setSuccessMessage("Ha ocurrido un error al procesar la petición, intentelo de nuevo.");
        await wait(5000);
        setSuccessMessage(null);
        throw new Error('Error adding the student');
      }
      const jsonResponse = await response.json();
      console.log(JSON.stringify(jsonResponse));
      setSuccessMessage("La petición se ha añadido correctamente.");
      setIsSubmitting(false);
      await wait(5000);
      setSuccessMessage(null);
    } catch (error) {
      console.error('Error:', error.message);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container mt-4">
      <form ref={formRef}>
        <h4>DATOS CONVENIO EMPRESA COLABORADORA DUAL:</h4>
        <span className="mb-5">
          Esta petición no tiene ninguna vinculación legal, solo se hace para formalizar la documentación necesaria para poder 
          desarrollar el programa de formación dual.
        </span>
        <div className="row mt-3">
          <div className="col-md-6">
            <div className="mb-1">
              <label htmlFor="emailCoordinador-input" className="form-label fw-bold fs-5">Email Coordinador:</label>
              <div>
                <span className="fw-bold text-decoration-underline">Muy importante.</span>- Este email deberá ser de la
                <span className="fw-bold"> persona que recibirá todas las notificaciones y documentos</span> relacionadas 
                con el desarrollo <span className="fw-bold">del proyecto DUAL.</span>
              </div>
              <input type="email" id="emailCoordinador-input" name="emailCoordinador" className="form-control" value={emailCoordinador}
                      onChange={handleEmailCoordinadorChange} maxLength={60} required/>
            </div>
            <div className="mb-3">
              <label htmlFor="telefonoCoordinador-input" className="form-label fw-bold fs-5">Teléfono Coordinador:</label>
              <div>
                <span className="fw-bold text-decoration-underline">Muy importante.</span>- Este <span className="fw-bold">teléfono </span> 
                deberá ser de la <span className="fw-bold">persona que recibirá todas las notificaciones y documentos</span> relacionadas 
                con el desarrollo <span className="fw-bold">del proyecto DUAL.</span>
              </div>
              <input type="text" id="telefonoCoordinador-input" name="telefonoCoordinador" className="form-control" 
                      value={telefonoCoordinador} onChange={handleTelefonoCoordinadorChange} maxLength={9} required/>
            </div>
            <div className="mb-3">
              <label htmlFor="razonSocial-input" className="form-label fw-bold fs-5">Razón Social:</label>
              <input type="text" id="razonSocial-input" name="razonSocial" className="form-control" value={razonSocial} 
                      onChange={handleRazonSocialChange} maxLength={60} required/>
            </div>
            <div className="mb-3">
              <label htmlFor="dirRazSocial-input" className="form-label fw-bold fs-5">Dirección Razón Social:</label>
              <input type="text" id="dirRazSocial-input" name="dirRazSocial" className="form-control" value={dirRazSocial} 
                      onChange={handleDirRazSocialChange} maxLength={100}/>
            </div>
            <div className="mb-3">
              <label htmlFor="municipio-input" className="form-label fw-bold fs-5">Municipio:</label>
              <input type="text" id="municipio-input" name="municipio" className="form-control" value={municipio} 
                      onChange={handleMunicipioChange} maxLength={40}/>
            </div>
            <div className="mb-3">
              <label htmlFor="responsableLegal-input" className="form-label fw-bold fs-5">Responsable Legal:</label>
              <input type="text" id="responsableLegal-input" name="responsableLegal" className="form-control" value={responsableLegal}
                      onChange={handleResponsableLegalChange} maxLength={45}/>
            </div>
          </div>
          <div className="col-md-6">
            <div className="mb-5">
              <label htmlFor="nombreCoordinador-input" className="form-label fw-bold fs-5">Nombre Coordinador:</label>
              <div>
                <span className="fw-bold text-decoration-underline">Muy importante.</span>- Esta persona deberá ser la
                <span className="fw-bold"> que recibirá todas las notificaciones y documentos</span> relacionadas 
                con el desarrollo <span className="fw-bold">del proyecto DUAL.</span>
              </div>
              <input type="text" id="nombreCoordinador-input" name="nombreCoordinador" className="form-control" value={nombreCoordinador} 
                      onChange={handleNombreCoordinadorChange} maxLength={45} required/>
            </div>
            <div className="mb-3 mt-5">
              <label htmlFor="telEmpresa-input" className="form-label fw-bold fs-5">Teléfono Empresa:</label>
              <input type="text" id="telEmpresa-input" name="telEmpresa" className="form-control" value={telEmpresa} 
                      onChange={handleTelEmpresaChange} maxLength={9}/>
            </div>
            <div className="mb-3">
              <label htmlFor="cif-input" className="form-label fw-bold fs-5">CIF:</label>
              <input type="text" id="cif-input" name="cif" className="form-control" value={cif} onChange={handleCifChange} maxLength={9} 
                      pattern="^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$" required/>
            </div>
            <div className="mb-3">
              <label htmlFor="provincia-input" className="form-label fw-bold fs-5">Provincia:</label>
              <input type="text" id="provincia-input" name="provincia" className="form-control" value={provincia} 
                      onChange={handleProvinciaChange} maxLength={40}/>
            </div>
            <div className="mb-3">
              <label htmlFor="cpRazSoc-input" className="form-label fw-bold fs-5">Código Postal Razón Social:</label>
              <input type="text" id="cpRazSoc-input" name="cpRazSoc" className="form-control" value={cpRazSoc} 
                      onChange={handleCpRazSocChange} maxLength={5}/>
            </div>
            <div className="mb-3">
              <label htmlFor="dniRl-input" className="form-label fw-bold fs-5">DNI Responsable:</label>
              <input type="text" id="dniRl-input" name="dniRl" className="form-control" value={dniRl} onChange={handleDniRlChange} 
                      pattern="[A-Z0-9]{9,10}" maxLength={10}/>
            </div>
          </div>
          <div className="col-12">
            <div className="mb-3">
              <label htmlFor="cargo-input" className="form-label fw-bold fs-5">Cargo:</label>
              <input type="text" id="cargo-input" name="cargo" className="form-control" value={cargo} onChange={handleCargoChange} 
                      maxLength={30}/>
            </div>
            <div className="mb-3">
              <label className="form-label fw-bold fs-5">Ciclo(s) de Grado que se solicitan:</label>
              <div className="grid grid-cols-2 gap-2">
                {dataSpecialities.map(speciality => (
                  <div key={speciality.idEspecialidad}
                    className="flex justify-between items-center bg-gray-100 rounded-lg p-2 hover:bg-gray-200">
                    <div className="flex items-center cursor-pointer"
                      onClick={() => handleSpecialityToggle(speciality.idEspecialidad)}>
                      <input type="checkbox" className="mr-2"
                        checked={specialities[0]?.includes(speciality.idEspecialidad)}
                        onChange={(event) => event.stopPropagation()}
                      />
                      <span className="ms-1">{speciality.nombreEsp}</span>
                    </div>
                    {specialities[0]?.includes(speciality.idEspecialidad) && (
                      <div className="flex items-center space-x-2 ms-2">
                        <label className="text-sm">Alumnos::</label>
                        <input type="number" className="form-control w-20" min="1"
                          value={specialities[1][specialities[0].indexOf(speciality.idEspecialidad)]}
                          onChange={(event) =>
                            handleAmmountChange(speciality.idEspecialidad, parseInt(event.target.value) || 1)
                          }
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <label htmlFor="descripcionPuesto-input" className="form-label fw-bold fs-5">Descripción del Puesto:</label>
              <div>
                Indicar de manera aproximada las <span className="fw-bold">tareas que se le asignará</span> al estudiante de Dual.
                Esta información nos ayuda a nosotros para realizar una <span className="fw-bold">mejor preselección de candidatos.</span>
              </div>
              <textarea id="descripcionPuesto-input" name="descripcionPuesto" className="form-control" value={descripcionPuesto} 
                          onChange={handleDescripcionPuestoChange} maxLength={500}/>
            </div>
            <div className="mb-3">
              <label htmlFor="direccionLugarTrabajo-input" className="form-label fw-bold fs-5">Dirección Lugar de Trabajo:</label>
              <div>
                Indicar en que lugar desarrollara el alumno su trabajo. En el caso de que el trabajo
                se desarrolle fuera de la sede de la empresa indicar el punto de encuentro. Esta
                información nos ayuda a nosotros para poder hacer una mejor asignación de
                candidatos.
              </div>
              <input type="text" id="direccionLugarTrabajo-input" name="direccionLugarTrabajo" className="form-control" 
                      value={direccionLugarTrabajo} onChange={handleDireccionLugarTrabajoChange} maxLength={100}/>
            </div>
            <div className="mb-3">
              <label className="form-label fw-bold fs-5">Métodos de Transporte:</label>
              <div>
                Indicar el/los medio de transporte posibles para que el alumno acuda al puesto de
                trabajo. Esto nos ayuda a realizar una mejor preselección de candidatos.
              </div>
              <div className="grid grid-cols-2 gap-2">
                {dataTransports.map(transport => (
                  <div key={transport.idTransporte}
                    className="flex justify-between items-center bg-gray-100 rounded-lg p-2 hover:bg-gray-200">
                    <div className="flex items-center cursor-pointer"
                      onClick={() => handleTransportToggle(transport.idTransporte)}>
                      <input type="checkbox" className="mr-2"
                        checked={metodosTransporte?.includes(transport.idTransporte)}
                        onChange={(event) => event.stopPropagation()}
                      />
                      <span className="ms-1">{transport.transporte}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <button type="button" className={isSubmitting ? "btn btn-disabled mb-3" : "btn btn-danger mb-3"} onClick={buttonAddCompanyRequest} 
              disabled={isSubmitting}>
            {isSubmitting ? "Procesando..." : "Enviar solicitud"}
        </button>
        {successMessage && (
          <div className="alert alert-success mt-3" role="alert">
            {successMessage}
          </div>
        )}
      </form>
    </div>
  );
};

export default AddCompanyRequest;