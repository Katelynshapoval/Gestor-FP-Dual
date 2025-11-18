import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as FormatValidation from "../functions/FormatValidation.js";

const Evaluation = () => {
  // Parametro recibido
  const { id } = useParams();
  // Para navegar a otras páginas
  const navigate = useNavigate();
  // Estado para almacenar el mensaje de éxito
  const [successMessage, setSuccessMessage] = useState("");
  // Estados individuales para cada campo
  const [idEvaluation, setIdEvaluation] = useState("");
  const [notaMedia, setNotaMedia] = useState("");
  const [idiomas, setIdiomas] = useState("");
  const [madurez, setMadurez] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [faltas, setFaltas] = useState("");
  const [notaTotal, setNotaTotal] = useState("");
  const [fecha, setFecha] = useState("");

  // Para saber si estoy editando una evaluación o generando una nueva.
  const [isEditing, setIsEditing] = useState(false);

  // Para crear mensajes que aparecen y desaparecen al tiempo
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // El useCallback debe declararse antes del useEffect para que funcione.
  // esto se usa para que en el hipotético de que idEvaluation cambiase
  // la función se volviese a ejecutar.
  const getEvaluation = useCallback(() => {
    const bodyParameters = {
      idManagement: id,
    };
    // Configurar las opciones para la solicitud fetch
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyParameters), // Convertir el objeto a JSON
    };
    fetch("/getEvaluationByManagementId", options) // Hacer una solicitud HTTP GET a '/getEvaluationByManagementId'
      .then((response) => response.json()) // Convertir la respuesta a JSON
      .then((evaluacion) => {
        setIdEvaluation(evaluacion[0].idEvaluacion);
        setNotaMedia(evaluacion[0].notaMedia);
        setIdiomas(evaluacion[0].idiomas);
        setMadurez(evaluacion[0].madurez);
        setCompetencia(evaluacion[0].competencia);
        setFaltas(evaluacion[0].faltas);
        setFecha(evaluacion[0].fecha);
        setIsEditing(true);
        console.log(evaluacion); // Mostrar el contenido en la consola
      })
      .catch((error) => {
        console.error("Error fetching evaluation data:", error);
        setIsEditing(false);
      });
  }, [id]);

  // Inicializar el formulario
  useEffect(() => {
    if (id && id !== 0) {
      const numero = id.slice(0, -1);
      const letraControl = id.slice(-1);
      const letras = "QRBMUHPWACKZFJLVDXSYIGTNOE";
      if (numero % 23 !== 0) {
        navigate("/");
      } else {
        if (letraControl !== letras[(numero / 23) % 26]) {
          navigate("/");
        }
      }
      getEvaluation();
    } else {
      navigate("/");
    }
  }, [id, navigate, getEvaluation]);

  // Calcular nota total automáticamente
  useEffect(() => {
    const porcentajeFaltas = (faltas / 1050) * 100;
    const valorFaltas = -0.1 * porcentajeFaltas + 1.5;

    const total =
      0.6 * notaMedia +
      0.05 * idiomas +
      0.1 * madurez +
      0.1 * competencia +
      (valorFaltas >= 0 ? valorFaltas : 0);
    setNotaTotal(total.toFixed(2));
  }, [notaMedia, idiomas, madurez, competencia, faltas]);

  // Handlers individuales
  const handleNotaMediaChange = (e) => {
    setNotaMedia(e.target.value);
  };

  const handleIdiomasChange = (e) => {
    setIdiomas(e.target.value);
  };

  const handleMadurezChange = (e) => {
    setMadurez(e.target.value);
  };

  const handleCompetenciaChange = (e) => {
    setCompetencia(e.target.value);
  };

  const handleFaltasChange = (e) => {
    setFaltas(e.target.value);
  };

  const save = async () => {
    const bodyParameters = {
      id: isEditing ? idEvaluation : id,
      notaMedia: notaMedia,
      idiomas: idiomas,
      madurez: madurez,
      competencia: competencia,
      faltas: faltas,
      notaTotal: notaTotal,
      fecha: FormatValidation.validDate(new Date()),
    };
    // Configurar las opciones para la solicitud fetch
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyParameters), // Convertir el objeto a JSON
    };
    if (isEditing) {
      const response = await fetch("/updateEvaluation", options);
      if (!response.ok) {
        setSuccessMessage(
          "Ha ocurrido un error al procesar la evaluación, intentelo de nuevo."
        );
        await wait(5000);
        setSuccessMessage(null);
        return;
      }
      setSuccessMessage("La evaluación se ha añadido correctamente.");
      await wait(5000);
      setSuccessMessage(null);
      getEvaluation();
    } else {
      const response = await fetch("/createEvaluation", options);
      if (!response.ok) {
        setSuccessMessage(
          "Ha ocurrido un error al procesar la evaluación, intentelo de nuevo."
        );
        await wait(5000);
        setSuccessMessage(null);
        return;
      }
      setSuccessMessage("La evaluación se ha añadido correctamente.");
      await wait(5000);
      setSuccessMessage(null);
      getEvaluation();
    }
  };

  const reset = () => {
    getEvaluation();
  };

  const cancel = () => {
    navigate("/linkStudents");
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="d-flex align-items-center">
              <h2 className="h4 fw-bold">
                {isEditing ? "Editar Evaluación" : "Nueva Evaluación"}
              </h2>
            </div>
            {isEditing && idEvaluation && (
              <div>
                <span className="badge bg-light text-dark">
                  ID: {idEvaluation}
                </span>
                <span className="badge bg-light text-dark">
                  Fecha ultima modificación: {fecha}
                </span>
              </div>
            )}
          </div>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Nota Media</label>
              <input
                type="number"
                className="form-control"
                value={notaMedia}
                onChange={handleNotaMediaChange}
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Idiomas</label>
              <input
                type="number"
                className="form-control"
                value={idiomas}
                onChange={handleIdiomasChange}
                min="0"
                placeholder="0"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Madurez</label>
              <input
                type="number"
                className="form-control"
                value={madurez}
                onChange={handleMadurezChange}
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Competencia</label>
              <input
                type="number"
                className="form-control"
                value={competencia}
                onChange={handleCompetenciaChange}
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>
            <div className="col-md-12">
              <label className="form-label">Faltas</label>
              <input
                type="number"
                className="form-control"
                value={faltas}
                onChange={handleFaltasChange}
                min="0"
                placeholder="0"
              />
            </div>
            <div className="col-12">
              <div className="card bg-light mt-3">
                <div className="card-body">
                  <div className="d-flex align-items-center mb-2">
                    <label className="form-label mb-0 me-2">Nota Total:</label>
                    <span className="h4 fw-bold text-danger mb-0">
                      {notaTotal || "0.00"}
                    </span>
                  </div>
                  <small className="text-muted">
                    Fórmula: (0.6*Nota Media + 0.05*Idiomas + 0.1*Madurez +
                    0.1*Competencia + 0.15*Faltas)
                  </small>
                </div>
              </div>
            </div>

            <div className="col-12 mt-4">
              <div className="d-flex gap-3">
                <button
                  type="button"
                  onClick={save}
                  className="btn btn-danger px-4"
                >
                  {isEditing ? "Actualizar" : "Guardar"}
                </button>
                {isEditing && idEvaluation && (
                  <button
                    type="button"
                    onClick={reset}
                    className="btn btn-outline-secondary px-4"
                  >
                    Restablecer valores originales
                  </button>
                )}
                <button
                  type="button"
                  onClick={cancel}
                  className="btn btn-outline-secondary px-4"
                >
                  Cancelar
                </button>
              </div>
            </div>
            {successMessage && (
              <div className="alert alert-success mt-3" role="alert">
                {successMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Evaluation;
