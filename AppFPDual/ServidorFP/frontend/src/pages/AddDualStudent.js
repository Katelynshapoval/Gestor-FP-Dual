import { useState, useEffect, useRef } from 'react';
import * as FormatValidation from '../functions/FormatValidation.js';

function AddDualStudentComponent() {
  // Definición de estados utilizando el hook useState
  const [successMessage, setSuccessMessage] = useState(""); // Estado para almacenar el mensaje de éxito
  // Estados para cargar datos en el form
  const [dataSpecialities, setDataSpecialities] = useState([]);
  const [dataPreferences, setDataPreferences] = useState([]);
  // Estados de datos recogidos en el form
  const [esMenor, setEsMenor] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [dniNie, setDniNie] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [preference1, setPreference1] = useState("");
  const [preference2, setPreference2] = useState("");
  const [preference3, setPreference3] = useState("");
  const [studiesEmail, setStudiesEmail] = useState("");
  const [nationality, setNationality] = useState("");
  const [drivingLicense, setDrivingLicense] = useState("");
  const [availability, setAvailability] = useState("");
  const [SSnumber, setSSNumber] = useState("");
  const [legalGuardianName, setLegalGuardianName] = useState("");
  const [speciality, setSpeciality] = useState("");
  const [studentTelephone, setStudentTelephone] = useState("");
  const [legalGuardianDni, setLegalGuardianDni] = useState("");
  const [email, setEmail] = useState("");
  const [adress, setAdress] = useState("");
  const [cp, setCP] = useState("");
  const [location, setLocation] = useState("");
  const [idioms, setIdioms] = useState("");
  const [file, setFile] = useState(null);
  const [cv, setCv] = useState(null);
  // Para validación del form
  const formRef = useRef(null);
  // Para crear mensajes que aparecen y desaparecen al tiempo
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ----------------------------------------------------------------   USE EFFECT
  useEffect(() => {
    GetAllSpecialities();
  }, []);

// -----------------------------------------------------------------   GET ALLS
// 
// Recoge todos los datos de la tabla preferencias y los guarda en dataPreferences
// en función de la especialidad recibida.
//
  function getPreferencesBySpeciality(speciality2) {
    const bodyParameters = {
      'idSpeciality': speciality2,
    };
    // Configurar las opciones para la solicitud fetch
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyParameters) // Convertir el objeto a JSON
    };
    fetch('/getPreferencesBySpeciality', options) // Hacer una solicitud HTTP GET a '/getPreferencesBySpeciality'
      .then(response => response.json()) // Convertir la respuesta a JSON
      .then(dataPreferences => {
        setDataPreferences(dataPreferences); // Establecer los datos obtenidos en el estado 'dataPreferences'
        console.log(dataPreferences); // Mostrar el contenido en la consola
      })
      .catch(error => {
        console.error('Error fetching preferences data:', error);
      });
  }

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

  // HANDLERS FUNCTIONS
  function HandleNameChange(event){
    setName(event.target.value);
  }
  function HandleGenderChange(event) {
    setGender(event.target.value);
  }

  function HandleDniNieChange(event) {
    setDniNie(event.target.value);
  }

  function HandleBirthdateChange(event) {
    const birthDate = new Date(event.target.value);
    const legalAge = new Date(new Date().setFullYear(new Date().getFullYear() - 18));
    if (birthDate > legalAge) {
      setEsMenor(true);
    } else{
      setEsMenor(false);
    }
      setBirthdate(event.target.value);
  }

  function HandlePreference1Change(event){
    setPreference1(event.target.value);
  }
  
  function HandlePreference2Change(event){
    setPreference2(event.target.value);
  }
  
  function HandlePreference3Change(event){
    setPreference3(event.target.value);
  }

  function HandleStudiesEmailChange(event) {
      setStudiesEmail(event.target.value);
  }

  function HandleNationalityChange(event) {
      setNationality(event.target.value);
  }

  function HandleDrivingLicenseChange(event) {
      setDrivingLicense(event.target.value);
  }

  function HandleAvailabilityChange(event) {
      setAvailability(event.target.value);
  }

  function HandleIdiomsChange(event) {
      setIdioms(event.target.value);
  }

  function HandleSSNumberChange(event) {
      setSSNumber(event.target.value);
  }

  function HandleLegalGuardianNameChange(event) {
      setLegalGuardianName(event.target.value);
  }

  function HandleSpecialityChange(event) {
      setSpeciality(event.target.value);
      getPreferencesBySpeciality(event.target.value);
  }

  function HandleStudentTelephoneChange(event) {
      setStudentTelephone(event.target.value);
  }

  function HandleLegalGuardianDniChange(event) {
      setLegalGuardianDni(event.target.value);
  }

  function HandleEmailChange(event) {
      setEmail(event.target.value);
  }

  const HandleAdressChange= (event) => {
    setAdress(event.target.value);
  };

  const HandleCPChange = (event) => {
    setCP(event.target.value);
  };

  const HandleLocationChange = (event) => {
    setLocation(event.target.value);
  };

  const HandleFileChange = (event) => {
    setFile(event.target.files[0]);
  }

  const HandleCvChange = (event) => {
    setCv(event.target.files[0]);
  }

// --------------------------------------------------------------------------  EJECUCIONES
  async function ButtonClickAddStudent(){
    if (!formRef.current.checkValidity()) {
      formRef.current.reportValidity();
      return;
    }
    if (!FormatValidation.dniNieValido(dniNie)){
      setSuccessMessage("Formato de DNI/NIE del alumno no valido, porfavor revise el campo.");
      await wait(5000);
      setSuccessMessage(null);
      return;
    }
    if (!FormatValidation.nSSValido(SSnumber)){
      setSuccessMessage("Formato del número de la Seguridad Social no válido, porfavor modifique el campo o déjelo vacío.");
      await wait(5000);
      setSuccessMessage(null);
      return;
    }
    if (esMenor && !FormatValidation.dniNieValido(legalGuardianDni)){
      setSuccessMessage("Formato de DNI/NIE del tutor legal no valido, porfavor revise el campo.");
      await wait(5000);
      setSuccessMessage(null);
      return;
    }
    AddNewStudent();
  }

  const AddNewStudent = async () => {
    try {
      const data = new FormData();
      data.append('emailinstituto', studiesEmail);
      data.append('dniNie', dniNie);
      data.append('nombre', name);
      data.append('sexo', gender);
      data.append('fechanacimiento', birthdate);
      data.append('nacionalidad', nationality);
      data.append('email', email);
      data.append('telalumno', studentTelephone);
      data.append('carnetconducir', drivingLicense);
      data.append('disponibilidad', availability);
      data.append('idiomas', idioms);
      data.append('numeroSS', SSnumber);
      data.append('domicilio', adress);
      data.append('cp', cp);
      data.append('localidad', location);
      data.append('especialidad', speciality);
      data.append('idpreferencia1', preference1);
      data.append('idpreferencia2', preference2);
      data.append('idpreferencia3', preference3);
      data.append('nombretutorlegal', legalGuardianName);
      data.append('dnitutorlegal', legalGuardianDni);
      data.append('doc', file);
      data.append('cv', cv);
  
      const options = {
        method: 'POST',
        body: data,
      };

      const response = await fetch("/addStudent", options);
      if (!response.ok) {
        setSuccessMessage("Ha ocurrido un error al procesar la petición, intentelo de nuevo.");
        await wait(5000);
        setSuccessMessage(null);
        throw new Error('Error adding the student');
      }
      const jsonResponse = await response.json();
      console.log(JSON.stringify(jsonResponse));
      setSuccessMessage("La petición se ha añadido correctamente.");
      await wait(5000);
      setSuccessMessage(null);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

// Renderizado del componente ------------------------------------------------  HTML
  return (
    <div className="container">
      <form ref={formRef}>
        <h4 className="mb-4 mt-3">AÑADIR ALUMNO:</h4>
        <div className="mb-3">
          <label htmlFor="studiesEmail-input" className="form-label">Email del Instituto:</label>
          <input type="email" className="form-control" id="studiesEmail-input" value={studiesEmail} onChange={HandleStudiesEmailChange}
                  // ^[a-zA-Z0-9._%+-]+ => Minimo un caracter cualquiera antes del @
                  pattern="^[a-zA-Z0-9._%+-]+@zaragoza\.salesianos\.edu$" maxLength={60} required/>
        </div>
        <div className="mb-3">
          <label htmlFor="DNI-input" className="form-label">DNI/NIE:</label>
          <input type="text" className="form-control" id="DNI-input" value={dniNie} onChange={HandleDniNieChange} 
                  pattern="[A-Z0-9]{9,10}" maxLength={10} required/>
        </div>
        <div className="mb-3">
          <label className="form-label">Nombre:</label>
          <input type="text" className="form-control" id="name-input" value={name} onChange={HandleNameChange}  maxLength={45} required/>
        </div>
        <div className="mb-3">
          <label className="form-label">Sexo:</label>
          <div className="form-check">
            <input className="form-check-input" type="radio" id="gender1" name="gender" value="Hombre"
              checked={gender === "Hombre"} onChange={HandleGenderChange} required />
            <label htmlFor="gender1" className="form-check-label">Hombre</label>
          </div>
          <div className="form-check">
            <input className="form-check-input" type="radio" id="gender2" name="gender" value="Mujer"
              checked={gender === "Mujer"} onChange={HandleGenderChange} />
            <label htmlFor="gender2" className="form-check-label">Mujer</label>
          </div>
          <div className="form-check">
            <input className="form-check-input" type="radio" id="gender3" name="gender"
              value="Otro" checked={gender !== "Hombre" && gender !== "Mujer" && gender !== ""}
              onChange={() => HandleGenderChange({ target: { value: "Otro" } })} />
            <label htmlFor="gender3" className="form-check-label">Otro:</label>
            {gender !== "Hombre" && gender !== "Mujer" && gender !== "" && (
              <input type="text" className="form-control mt-2" maxLength={15}
                value={gender === "Otro" ? "" : gender}
                onChange={e => HandleGenderChange({ target: { value: e.target.value } })}
                required
              />
            )}
          </div>
        </div>
        <div className="mb-3">
          <label htmlFor="birthdate-input" className="form-label">Fecha de Nacimiento:</label>
          <input type="date" className="form-control" id="birthdate-input" value={birthdate} onChange={HandleBirthdateChange} required/>
        </div>
        {esMenor && (
          <>
            <div className="mb-3">
              <label htmlFor="legalGuardianName-input" className="form-label">Nombre del Tutor Legal:</label>
              <input type="text" className="form-control" id="legalGuardianName-input" value={legalGuardianName} onChange={HandleLegalGuardianNameChange} maxLength={45} required/>
            </div>
            <div className="mb-3">
              <label htmlFor="dniTutor-input" className="form-label">DNI del Tutor Legal:</label>
              <input type="text" className="form-control" id="dniTutor-input" value={legalGuardianDni} onChange={HandleLegalGuardianDniChange} 
                      pattern="[A-Z0-9]{9,10}" maxLength={10} required/>
            </div>
          </>
        )}
        <div className="mb-3">
          <label htmlFor="nationality-input" className="form-label">Nacionalidad:</label>
          <input type="text" className="form-control" id="nationality-input" value={nationality} onChange={HandleNationalityChange} maxLength={20} required/>
        </div>
        <div className="mb-3">
          <label htmlFor="email-input" className="form-label">Email personal:</label>
          <input type="email" className="form-control" id="email-input" value={email} onChange={HandleEmailChange} maxLength={60} required/>
        </div>
        <div className="mb-3">
          <label htmlFor="studentTelephone-input" className="form-label">Teléfono:</label>
          <input type="text" className="form-control" id="studentTelephone-input" value={studentTelephone} 
                  onChange={HandleStudentTelephoneChange} pattern="[0-9]{9}" required/>
        </div>
        <div className="mb-3">
          <label className="form-label">Carnet de Conducir:</label>
          <div className="form-check">
            <input className="form-check-input" type="radio" id="drivingLicense1" name="drivingLicense" value="true"
              checked={drivingLicense === "true"} onChange={HandleDrivingLicenseChange} required/>
            <label htmlFor="drivingLicense1" className="form-check-label">Sí</label>
          </div>
          <div className="form-check">
            <input className="form-check-input" type="radio" id="drivingLicense2" name="drivingLicense" value="false"
              checked={drivingLicense === "false"} onChange={HandleDrivingLicenseChange}/>
            <label htmlFor="drivingLicense2" className="form-check-label">No</label>
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label">Disponibilidad de vehículo:</label>
          <div className="form-check">
            <input className="form-check-input" type="radio" id="availability1" name="availability" value="true"
              checked={availability === "true"} onChange={HandleAvailabilityChange} required/>
            <label htmlFor="availability1" className="form-check-label">
              Tengo un vehículo que puedo usar todos los días para ir a trabajar.
            </label>
          </div>
          <div className="form-check">
            <input className="form-check-input" type="radio" id="availability2" name="availability" value="false"
              checked={availability === "false"} onChange={HandleAvailabilityChange}/>
            <label htmlFor="availability2" className="form-check-label">No dispongo de vehículo.</label>
          </div>
        </div>
        <div className="mb-3">
          <label htmlFor="idioms-input" className="form-label">Idiomas conocidos(con nivel):</label>
          <input type="text" className="form-control" id="idioms-input" value={idioms} onChange={HandleIdiomsChange} required maxLength={15}/>
        </div>
        <div className="mb-3">
          <label htmlFor="SSnumber-input" className="form-label">Número de Seguridad Social (en caso de tenerlo):</label>
          <input type="text" className="form-control" id="SSnumber-input" value={SSnumber} onChange={HandleSSNumberChange} placeholder="Ejemplo: 28 00012345 63" 
                  pattern="[0-9]{12}" maxLength={12}/>
        </div>
        <div className="mb-3">
          <label htmlFor="adress-input" className="form-label">Domicilio:</label>
          <input type="text" className="form-control" id="adress-input" value={adress} onChange={HandleAdressChange} maxLength={50} required/>
        </div>
        <div className="mb-3">
          <label htmlFor="cp-input" className="form-label">Código Postal:</label>
          <input type="text" className="form-control" id="cp-input" value={cp} onChange={HandleCPChange} maxLength={5} required/>
        </div>
        <div className="mb-3">
          <label htmlFor="location-input" className="form-label">Localidad:</label>
          <input type="text" className="form-control" id="location-input" value={location} onChange={HandleLocationChange}  maxLength={40} required/>
        </div>
        <div className="mb-3">
          <label className="form-label">Especialidad:</label>
          <select className="form-select" value={speciality} onChange={HandleSpecialityChange} required>
            <option value="">Seleccione una especialidad</option>
            {dataSpecialities.map(speciality => (
              <option key={speciality.idEspecialidad} value={speciality.idEspecialidad}>{speciality.nombreEsp}</option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <label className="form-label">Preferencia 1:</label>
          <select className="form-select" value={preference1} onChange={HandlePreference1Change} required>
            <option value="">Seleccione una preferencia</option>
            {dataPreferences.map(p => (
              <option key={p.idPreferencia} value={p.idPreferencia}>{p.preferencia}</option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <label className="form-label">Preferencia 2:</label>
          <select className="form-select" value={preference2} onChange={HandlePreference2Change} required>
            <option value="">Seleccione una preferencia</option>
            {dataPreferences.map(p => (
              <option key={p.idPreferencia} value={p.idPreferencia}>{p.preferencia}</option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <label className="form-label">Preferencia 3:</label>
          <select className="form-select" value={preference3} onChange={HandlePreference3Change} required>
            <option value="">Seleccione una preferencia</option>
            {dataPreferences.map(p => (
              <option key={p.idPreferencia} value={p.idPreferencia}>{p.preferencia}</option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <label className="form-label">Inserta tu CV:</label>
          <input type="file" className="form-control" id="file-input" accept=".pdf" onChange={HandleCvChange} required/>
        </div>
        <div className="mb-3">
          <label className="form-label">Inserta el <a href="https://docs.google.com/forms/d/e/1FAIpQLSfnDOKn6jRMtjhdqJTh2FnHTu_sa-ZiuodFvTRvbT-gm082ow/viewform" target="_blank" rel="noreferrer">Anexo 2</a> firmado:</label>
          <input type="file" className="form-control" id="file-input2" accept=".pdf" onChange={HandleFileChange} required/>
        </div>
        <button type="button" className="btn btn-danger mb-3" onClick={ButtonClickAddStudent}>PRESENTAR CANDIDATURA</button>
        {successMessage && (
          <div className="alert alert-success mt-3" role="alert">
            {successMessage}
          </div>
        )}
      </form>
    </div>
  );
}

export default AddDualStudentComponent;