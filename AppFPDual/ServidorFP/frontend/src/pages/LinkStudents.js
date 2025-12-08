import { useEffect, useState, useCallback } from "react";
import { useUser } from "../globales/User";
import { useNavigate } from "react-router-dom";

const LinkStudents = () => {
  const { user } = useUser(); // Obtiene el usuario del contexto
  const navigate = useNavigate(); // Para mandar a login si no hay usuario
  const [linkRequests, setLinkRequests] = useState([]);
  const [companyRequests, setCompanyRequests] = useState([]);
  const [showDoc, setShowDoc] = useState(null);
  const [currentDocUrl, setCurrentDocUrl] = useState(null); // Para el visualizador de documentos
  const [expandedCards, setExpandedCards] = useState(new Set()); // Para expandir las cards
  const [sendingInfo, setSendingInfo] = useState(new Set()); // Para evitar múltiples envíos
  // Para gestionar el valor de las empresas que aún no se han asignado definitivamente
  const [empresa1, setEmpresa1] = useState([]);
  const [empresa2, setEmpresa2] = useState([]);
  const [empresa3, setEmpresa3] = useState([]);

  // El useCallback debe declararse antes del useEffect para que funcione.
  // esto se usa para que en el hipotético de que user.specialities cambiase
  // la función se volviese a ejecutar.

  // Esta funcion recuepra las peticiones que ha hecho cada empresa de las
  // distintas especialidades.
  // Solo recupera las pertinentes para el usuario que ha entrado.
  const GetCompanyRequests = useCallback(() => {
    const bodyParameters = {
      specialities: user.specialities,
    };
    // Configurar las opciones para la solicitud fetch
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyParameters), // Convertir el objeto a JSON
    };

    fetch("/getCompanyRequests", options) // Hacer una solicitud HTTP GET a '/getCompanyRequests'
      .then((response) => response.json()) // Convertir la respuesta a JSON
      .then((companyRequests) => {
        setCompanyRequests(companyRequests); // Establecer los datos obtenidos en el estado 'companyRequests'
        console.log(companyRequests); // Mostrar el contenido en la consola
      })
      .catch((error) => {
        console.error("Error fetching linkRequests data:", error);
      });
  }, [user.specialities]);

  // Recoge todos los datos de un join de tablas y los guarda en linkRequests
  const LinkStudents = useCallback(() => {
    const bodyParameters = {
      specialities: user.specialities,
    };
    // Configurar las opciones para la solicitud fetch
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyParameters), // Convertir el objeto a JSON
    };

    fetch("/linkStudents", options) // Hacer una solicitud HTTP GET a '/linkStudents'
      .then((response) => response.json()) // Convertir la respuesta a JSON
      .then((linkRequests) => {
        setLinkRequests(linkRequests); // Establecer los datos obtenidos en el estado 'linkRequests'
        // Establecer el valor inicial de las empresas de las dropdown
        setEmpresa1(
          linkRequests.map((r) => ({
            idGestion: r.idGestion,
            idEmpresa1: r.idEmpresa1,
            em1: r.em1,
          }))
        );
        setEmpresa2(
          linkRequests.map((r) => ({
            idGestion: r.idGestion,
            idEmpresa2: r.idEmpresa2,
            em2: r.em2,
          }))
        );
        setEmpresa3(
          linkRequests.map((r) => ({
            idGestion: r.idGestion,
            idEmpresa3: r.idEmpresa3,
            em3: r.em3,
          }))
        );
        console.log(linkRequests); // Mostrar el contenido en la consola
      })
      .catch((error) => {
        console.error("Error fetching linkRequests data:", error);
      });
  }, [user.specialities]);

  // ----------------------------------------------------------------   USE EFFECTS
  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
    GetCompanyRequests();
    LinkStudents();
  }, [user, navigate, GetCompanyRequests, LinkStudents]);

  // -----------------------------------------------------------------   GETS
  //
  // Esta funcion saca el documento elegido de la gestión escogida.
  const getDoc = (idGestion, tipo) => {
    let route = "";
    switch (tipo) {
      case "cv":
        route = `/linkStudents/${idGestion}/cv`;
        break;
      case "anexo2":
        route = `/linkStudents/${idGestion}/anexo2`;
        break;
      case "anexo3":
        route = `/linkStudents/${idGestion}/anexo3`;
        break;
      default:
        return;
    }

    fetch(route)
      .then((res) => {
        if (!res.ok) throw new Error("Error al obtener el documento");
        return res.blob();
      })
      .then((blob) => {
        // Si ya tenemos un documento almacenado lo eliminamos
        if (currentDocUrl) {
          URL.revokeObjectURL(currentDocUrl);
        }
        const url = URL.createObjectURL(blob);
        setCurrentDocUrl(url);
        setShowDoc({
          tipo,
          url,
          nombre: `${tipo.toUpperCase()} - ${idGestion}`,
          nombreAlumno:
            linkRequests.find((r) => r.idGestion === idGestion)?.nombre || "",
        });
      })
      .catch((err) => {
        alert(err.message);
      });
  };

  // Esta funcion saca el documento elegido de la gestión escogida.
  const getEvaluation = (idGestion) => {
    if (!idGestion) navigate(`/evaluate/0`);
    const letras = "QRBMUHPWACKZFJLVDXSYIGTNOE";
    navigate(`/evaluate/${idGestion * 23 + letras[idGestion % 26]}`);
  };

  // -----------------------------------------------------------------   FUNCTIONS
  //
  // Función para cerrar el visualizador de docs.
  const closeDocViewer = () => {
    if (currentDocUrl) {
      URL.revokeObjectURL(currentDocUrl);
      setCurrentDocUrl(null);
    }
    setShowDoc(null);
  };

  // Función para validar el documento.
  const validateDoc = async () => {
    const idGestion = showDoc.nombre.split(" - ")[1];
    await fetch(`/linkStudents/${idGestion}/${showDoc.tipo}/validate`);
    closeDocViewer();
    LinkStudents();
  };

  // Función para desplegar las cards.
  const toggleCard = (id) => {
    const newSet = new Set(expandedCards);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedCards(newSet);
  };

  // Función para enviar la información de los alumnos a las empresas.
  const sendInfo = async (idGestion, idAlumno, idEmpresa) => {
    // Crear un identificador único para este botón
    const buttonId = `${idGestion}-${idEmpresa}`;
    // Si ya se está enviando información con este botón, no hacer nada
    if (sendingInfo.has(buttonId)) return;
    // Añadir el botón al array de botones en proceso
    setSendingInfo((prev) => new Set([...prev, buttonId]));
    try {
      const url = window.location.origin;
      const bodyParameters = {
        idGestion: idGestion,
        idAlumno: idAlumno,
        idEmpresa: idEmpresa,
        url: url,
      };
      // Configurar las opciones para la solicitud fetch
      const options = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyParameters), // Convertir el objeto a JSON
      };
      await fetch("/sendMail", options);
      LinkStudents();
    } catch (error) {
      console.error("Error sending info:", error);
    } finally {
      // Eliminar el botón del array de botones en proceso
      setSendingInfo((prev) => {
        const newSet = new Set(prev);
        newSet.delete(buttonId);
        return newSet;
      });
    }
  };

  const handleCompanyChange = (idGestion, array) => (event) => {
    const idEmpresa = parseInt(event.target.value, 10);
    // Encontrar la empresa seleccionada en companyRequests para obtener el nombre
    const selectedCompany = companyRequests.find(
      (cr) => cr.idEmpresa === idEmpresa
    );
    const nombre = selectedCompany ? selectedCompany.empresa : "";
    // Actualizar el array correspondiente según el número recibido
    switch (array) {
      case 1:
        setEmpresa1((prev) =>
          prev.map((item) =>
            item.idGestion === idGestion
              ? { ...item, idEmpresa1: idEmpresa, em1: nombre }
              : item
          )
        );
        break;
      case 2:
        setEmpresa2((prev) =>
          prev.map((item) =>
            item.idGestion === idGestion
              ? { ...item, idEmpresa2: idEmpresa, em2: nombre }
              : item
          )
        );
        break;
      case 3:
        setEmpresa3((prev) =>
          prev.map((item) =>
            item.idGestion === idGestion
              ? { ...item, idEmpresa3: idEmpresa, em3: nombre }
              : item
          )
        );
        break;
      default:
        break;
    }
  };

  // Función para asignar empresa a un alumno.
  const assign = async (idGestion, array) => {
    switch (array) {
      case 1:
        const empresa1Data = empresa1.find(
          (item) => item.idGestion === idGestion
        );
        if (empresa1Data) {
          const bodyParameters = {
            idGestion: idGestion,
            idEmpresa: empresa1Data.idEmpresa1,
          };
          // Configurar las opciones para la solicitud fetch
          const options = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(bodyParameters), // Convertir el objeto a JSON
          };
          const response = await fetch("/updateCompany1", options);
          if (!response.ok) {
            return;
          }
        }
        GetCompanyRequests();
        LinkStudents();
        break;
      case 2:
        const empresa2Data = empresa2.find(
          (item) => item.idGestion === idGestion
        );
        if (empresa2Data) {
          const bodyParameters = {
            idGestion: idGestion,
            idEmpresa: empresa2Data.idEmpresa2,
          };
          // Configurar las opciones para la solicitud fetch
          const options = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(bodyParameters), // Convertir el objeto a JSON
          };
          const response = await fetch("/updateCompany2", options);
          if (!response.ok) {
            return;
          }
        }
        GetCompanyRequests();
        LinkStudents();
        break;
      case 3:
        const empresa3Data = empresa3.find(
          (item) => item.idGestion === idGestion
        );
        if (empresa3Data) {
          const bodyParameters = {
            idGestion: idGestion,
            idEmpresa: empresa3Data.idEmpresa3,
          };
          // Configurar las opciones para la solicitud fetch
          const options = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(bodyParameters), // Convertir el objeto a JSON
          };
          const response = await fetch("/updateCompany3", options);
          if (!response.ok) {
            return;
          }
        }
        GetCompanyRequests();
        LinkStudents();
        break;
      default:
        break;
    }
  };

  // Devuelve un emoji que representa el estado de la empresa según el estid
  const getEmpresaEmoji = (estid) => {
    switch (estid) {
      case 5:
        return "✅"; // Finalizado/Aceptado
      case 3:
        return "❌"; // Rechazado
      case 1:
        return "🟠"; // Asignado pero no finalizado
      case 2:
        return "📤"; // Info enviada
      case 4:
        return "⚠️"; // Pendiente/observaciones
      default:
        return "⚪"; // Nada / sin asignar
    }
  };

  // Devuelve el texto que aparecerá al pasar el cursor por encima del emoji
  const getEmpresaTooltip = (estid) => {
    switch (estid) {
      case 5:
        return "Finalizado / Aceptado";
      case 3:
        return "Rechazado";
      case 1:
        return "Asignado (no finalizado)";
      case 2:
        return "Información enviada";
      case 4:
        return "Pendiente";
      default:
        return "Sin asignar";
    }
  };

  const getAnexo = (r) => {
    if (r.anexo2FirmadoRecibido) {
      getDoc(r.idGestion, "anexo2");
    } else if (r.anexo3FirmadoRecibido) {
      getDoc(r.idGestion, "anexo3");
    } else {
      alert("No hay Anexo 2 o 3 disponible.");
    }
  };

  return (
    <div className="container">
      <div className="row">
        <h2 className="text-xl font-semibold mb-4 mt-4">
          Peticiones de Alumnos
        </h2>
        <div className="grid gap-4">
          {linkRequests.map((r) => {
            const isExpanded = expandedCards.has(r.idGestion);
            return (
              <div
                key={r.idGestion}
                className="card border rounded-lg shadow-sm mb-4"
              >
                <div className="card-body p-2 position-relative">
                  <div className="d-flex align-items-center justify-content-between gap-3">
                    <div className="d-flex flex-column">
                      <h3 className="card-title mb-0 text-xs font-medium">
                        {r.nombre} ({r.dni})
                      </h3>

                      {r.nombreEsp && (
                        <span className="text-xs text-muted">
                          {r.nombreEsp}
                        </span>
                      )}
                    </div>

                    <div className="d-flex flex-wrap gap-1 flex-grow-1 justify-content-end">
                      <div
                        className="d-flex flex-column me-2 text-center"
                        style={{ lineHeight: "1", fontSize: "0.8rem" }}
                      >
                        <p className="mb-0">Firmados:</p>

                        <div className="d-flex gap-2 justify-content-center mt-1">
                          <span>
                            A2/A3:{" "}
                            {r.anexo2FirmadoRecibido || r.anexo3FirmadoRecibido
                              ? "✅"
                              : "❌"}
                          </span>
                          <span>
                            Calendario: {r.calendarioComprobado ? "✅" : "❌"}
                          </span>
                        </div>
                      </div>

                      {r.em1 && (
                        <span
                          className="empresa-chip"
                          title={getEmpresaTooltip(r.estid1)}
                        >
                          EMPRESA 1: {r.em1} {getEmpresaEmoji(r.estid1)}
                        </span>
                      )}

                      {r.em2 && (
                        <span
                          className="empresa-chip"
                          title={getEmpresaTooltip(r.estid2)}
                        >
                          EMPRESA 2: {r.em2} {getEmpresaEmoji(r.estid2)}
                        </span>
                      )}

                      {r.em3 && (
                        <span
                          className="empresa-chip"
                          title={getEmpresaTooltip(r.estid3)}
                        >
                          EMPRESA 3: {r.em3} {getEmpresaEmoji(r.estid3)}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => toggleCard(r.idGestion)}
                      className="btn btn-sm btn-outline-secondary"
                      style={{ minWidth: "32px", minHeight: "32px" }}
                    >
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3">
                      <div className="row mt-2">
                        <div className="col">
                          {(!isExpanded ||
                            r.estid1 === 2 ||
                            r.estid1 === 3 ||
                            r.estid1 === 4 ||
                            r.estid1 === 5) && (
                            <span
                              className={`badge ${
                                r.estid1 === 0
                                  ? "bg-info"
                                  : r.estid1 === 1
                                  ? "bg-secondary"
                                  : r.estid1 === 2
                                  ? "bg-primary"
                                  : r.estid1 === 3
                                  ? "bg-danger"
                                  : r.estid1 === 4
                                  ? "bg-warning"
                                  : "bg-success"
                              } text-white px-2 py-1 rounded text-xs`}
                            >
                              EMPRESA 1: {r.em1}
                            </span>
                          )}
                          {isExpanded && (r.estid1 === 0 || r.estid1 === 1) && (
                            <div className="d-flex align-items-center gap-2 mt-1">
                              <span className="text-nowrap">EMPRESA 1:</span>
                              <select
                                className="form-select form-select-sm"
                                defaultValue={r.idEmpresa1}
                                onChange={handleCompanyChange(r.idGestion, 1)}
                              >
                                <option value="">Selecciona empresa...</option>
                                {companyRequests
                                  .filter(
                                    (cr) =>
                                      cr.idEspecialidad === r.idEspecialidad
                                  )
                                  .map((cr) => (
                                    <option
                                      key={cr.idEmpresa}
                                      value={cr.idEmpresa}
                                    >
                                      {cr.empresa} (Disponibilidad:{" "}
                                      {cr.cantidad})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </div>

                        <div className="col">
                          {r.em2 &&
                            (!isExpanded ||
                              r.estid2 === 2 ||
                              r.estid2 === 3 ||
                              r.estid2 === 4 ||
                              r.estid2 === 5) && (
                              <span
                                className={`badge ${
                                  r.estid2 === 0
                                    ? "bg-info"
                                    : r.estid2 === 1
                                    ? "bg-secondary"
                                    : r.estid2 === 2
                                    ? "bg-primary"
                                    : r.estid2 === 3
                                    ? "bg-danger"
                                    : r.estid2 === 4
                                    ? "bg-warning"
                                    : "bg-success"
                                } text-white px-2 py-1 rounded text-xs`}
                              >
                                EMPRESA 2: {r.em2}
                              </span>
                            )}
                          {r.em2 &&
                            isExpanded &&
                            (r.estid2 === 0 || r.estid2 === 1) && (
                              <div className="d-flex align-items-center gap-2 mt-1">
                                <span className="text-nowrap">EMPRESA 2:</span>
                                <select
                                  className="form-select form-select-sm"
                                  defaultValue={r.idEmpresa2}
                                  onChange={handleCompanyChange(r.idGestion, 2)}
                                >
                                  <option value="">
                                    Selecciona empresa...
                                  </option>
                                  {companyRequests
                                    .filter(
                                      (cr) =>
                                        cr.idEspecialidad === r.idEspecialidad
                                    )
                                    .map((cr) => (
                                      <option
                                        key={cr.idEmpresa}
                                        value={cr.idEmpresa}
                                      >
                                        {cr.empresa} (Disponibilidad:{" "}
                                        {cr.cantidad})
                                      </option>
                                    ))}
                                </select>
                              </div>
                            )}
                        </div>

                        <div className="col">
                          {r.em3 &&
                            (!isExpanded ||
                              r.estid3 === 2 ||
                              r.estid3 === 3 ||
                              r.estid3 === 4 ||
                              r.estid3 === 5) && (
                              <span
                                className={`badge ${
                                  r.estid3 === 0
                                    ? "bg-info"
                                    : r.estid3 === 1
                                    ? "bg-secondary"
                                    : r.estid3 === 2
                                    ? "bg-primary"
                                    : r.estid3 === 3
                                    ? "bg-danger"
                                    : r.estid3 === 4
                                    ? "bg-warning"
                                    : "bg-success"
                                } text-white px-2 py-1 rounded text-xs`}
                              >
                                EMPRESA 3: {r.em3}
                              </span>
                            )}
                          {r.em3 &&
                            isExpanded &&
                            (r.estid3 === 0 || r.estid3 === 1) && (
                              <div className="d-flex align-items-center gap-2 mt-1">
                                <span className="text-nowrap">EMPRESA 3:</span>
                                <select
                                  className="form-select form-select-sm"
                                  defaultValue={r.idEmpresa3}
                                  onChange={handleCompanyChange(r.idGestion, 3)}
                                >
                                  <option value="">
                                    Selecciona empresa...
                                  </option>
                                  {companyRequests
                                    .filter(
                                      (cr) =>
                                        cr.idEspecialidad === r.idEspecialidad
                                    )
                                    .map((cr) => (
                                      <option
                                        key={cr.idEmpresa}
                                        value={cr.idEmpresa}
                                      >
                                        {cr.empresa} (Disponibilidad:{" "}
                                        {cr.cantidad})
                                      </option>
                                    ))}
                                </select>
                              </div>
                            )}
                        </div>
                      </div>

                      <div className="row mt-3">
                        <div className="col-4">
                          <div>
                            <span
                              className={`badge ${
                                r.estid1 === 0
                                  ? "bg-info"
                                  : r.estid1 === 1
                                  ? "bg-secondary"
                                  : r.estid1 === 2
                                  ? "bg-primary"
                                  : r.estid1 === 3
                                  ? "bg-danger"
                                  : r.estid1 === 4
                                  ? "bg-warning"
                                  : "bg-success"
                              } text-white px-2 py-1 rounded text-xs`}
                              style={{
                                wordWrap: "break-word",
                                whiteSpace: "normal",
                                display: "inline-block",
                              }}
                            >
                              {r.est1}
                            </span>
                          </div>
                          {(r.estid1 === 0 || r.estid1 === 1) && (
                            <div>
                              <button
                                onClick={() => assign(r.idGestion, 1)}
                                className={"btn btn-sm btn-primary mt-2"}
                              >
                                {r.estid1 === 0 ? "Asignar" : "Reasignar"}
                              </button>
                            </div>
                          )}
                          {user.specialities[0] == null &&
                            r.estid1 === 1 &&
                            r.anexo2FirmadoRecibido === 1 && (
                              <button
                                onClick={() =>
                                  sendInfo(
                                    r.idGestion,
                                    r.idAlumno,
                                    r.idEmpresa1
                                  )
                                }
                                className={
                                  sendingInfo.has(`${r.idGestion}-1`)
                                    ? "btn btn-sm btn-disabled mt-2"
                                    : "btn btn-sm btn-primary mt-2"
                                }
                                disabled={sendingInfo.has(`${r.idGestion}-1`)}
                              >
                                {sendingInfo.has(`${r.idGestion}-1`)
                                  ? "Enviando..."
                                  : "Enviar información a la empresa."}
                              </button>
                            )}
                          {r.tipo1 && (
                            <div>
                              <p className="text-sm text-muted mb-0 mt-2">
                                Tipo Contrato
                              </p>
                              <p>{r.tipo1}</p>
                            </div>
                          )}
                          {r.obv1 && (
                            <div className="md:col-span-2 lg:col-span-4 mt-3">
                              <p className="text-sm text-muted mb-0">
                                Observaciones
                              </p>
                              <p className="text-sm">{r.obv1}</p>
                            </div>
                          )}
                        </div>

                        <div className="col-4">
                          {r.est2 && (
                            <div>
                              <span
                                className={`badge ${
                                  r.estid2 === 0
                                    ? "bg-info"
                                    : r.estid2 === 1
                                    ? "bg-secondary"
                                    : r.estid2 === 2
                                    ? "bg-primary"
                                    : r.estid2 === 3
                                    ? "bg-danger"
                                    : r.estid2 === 4
                                    ? "bg-warning"
                                    : "bg-success"
                                } text-white px-2 py-1 rounded text-xs`}
                                style={{
                                  wordWrap: "break-word",
                                  whiteSpace: "normal",
                                  display: "inline-block",
                                }}
                              >
                                {r.est2}
                              </span>
                            </div>
                          )}
                          {(r.estid2 === 0 || r.estid2 === 1) && (
                            <div>
                              <button
                                onClick={() => assign(r.idGestion, 2)}
                                className={"btn btn-sm btn-primary mt-2"}
                              >
                                {r.estid2 === 0 ? "Asignar" : "Reasignar"}
                              </button>
                            </div>
                          )}
                          {user.specialities[0] == null &&
                            r.estid2 === 1 &&
                            r.anexo2FirmadoRecibido === 1 && (
                              <button
                                onClick={() =>
                                  sendInfo(
                                    r.idGestion,
                                    r.idAlumno,
                                    r.idEmpresa2
                                  )
                                }
                                className={
                                  sendingInfo.has(`${r.idGestion}-2`)
                                    ? "btn btn-sm btn-disabled mt-2"
                                    : "btn btn-sm btn-primary mt-2"
                                }
                                disabled={sendingInfo.has(`${r.idGestion}-2`)}
                              >
                                {sendingInfo.has(`${r.idGestion}-2`)
                                  ? "Enviando..."
                                  : "Enviar información a la empresa."}
                              </button>
                            )}
                          {r.tipo2 && (
                            <div>
                              <p className="text-sm text-muted mb-0 mt-2">
                                Tipo Contrato
                              </p>
                              <p>{r.tipo2}</p>
                            </div>
                          )}
                          {r.obv2 && (
                            <div className="md:col-span-2 lg:col-span-4 mt-3">
                              <p className="text-sm text-muted mb-0">
                                Observaciones
                              </p>
                              <p className="text-sm">{r.obv2}</p>
                            </div>
                          )}
                        </div>

                        <div className="col-4">
                          {r.est3 && (
                            <div>
                              <span
                                className={`badge ${
                                  r.estid3 === 0
                                    ? "bg-info"
                                    : r.estid3 === 1
                                    ? "bg-secondary"
                                    : r.estid3 === 2
                                    ? "bg-primary"
                                    : r.estid3 === 3
                                    ? "bg-danger"
                                    : r.estid3 === 4
                                    ? "bg-warning"
                                    : "bg-success"
                                } text-white px-2 py-1 rounded text-xs`}
                                style={{
                                  wordWrap: "break-word",
                                  whiteSpace: "normal",
                                  display: "inline-block",
                                }}
                              >
                                {r.est3}
                              </span>
                            </div>
                          )}
                          {(r.estid3 === 0 || r.estid3 === 1) && (
                            <div>
                              <button
                                onClick={() => assign(r.idGestion, 3)}
                                className={"btn btn-sm btn-primary mt-2"}
                              >
                                {r.estid3 === 0 ? "Asignar" : "Reasignar"}
                              </button>
                            </div>
                          )}
                          {user.specialities[0] == null &&
                            r.estid3 === 1 &&
                            r.anexo2FirmadoRecibido === 1 && (
                              <button
                                onClick={() =>
                                  sendInfo(
                                    r.idGestion,
                                    r.idAlumno,
                                    r.idEmpresa3
                                  )
                                }
                                className={
                                  sendingInfo.has(`${r.idGestion}-3`)
                                    ? "btn btn-sm btn-disabled mt-2"
                                    : "btn btn-sm btn-primary mt-2"
                                }
                                disabled={sendingInfo.has(`${r.idGestion}-3`)}
                              >
                                {sendingInfo.has(`${r.idGestion}-3`)
                                  ? "Enviando..."
                                  : "Enviar información a la empresa."}
                              </button>
                            )}
                          {r.tipo3 && (
                            <div>
                              <p className="text-sm text-muted mb-0 mt-2">
                                Tipo Contrato
                              </p>
                              <p>{r.tipo3}</p>
                            </div>
                          )}
                          {r.obv3 && (
                            <div className="md:col-span-2 lg:col-span-4 mt-3">
                              <p className="text-sm text-muted mb-0">
                                Observaciones
                              </p>
                              <p className="text-sm">{r.obv3}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="col-12 mt-3">
                        <p className="mb-1">
                          Correo electrónico: {r.email || "—"}
                        </p>

                        <p className="mb-1">
                          Número de teléfono: {r.telalumno || "—"}
                        </p>

                        <p className="mb-1">
                          Carnet de conducir: {r.carnetDeConducir ? "✅" : "❌"}
                        </p>

                        <p className="mb-1">
                          Disponibilidad de coche: {r.tieneCoche ? "✅" : "❌"}
                        </p>
                      </div>

                      <div className="row mt-3">
                        <div className="col-4">
                          <div>
                            <p className="text-sm text-muted mb-0">
                              Documentos:
                            </p>

                            <div className="d-flex gap-2">
                              <button
                                onClick={() => getDoc(r.idGestion, "cv")}
                                className="btn btn-sm btn-primary"
                              >
                                Ver CV
                              </button>

                              <button
                                onClick={() => getAnexo(r)}
                                className="btn btn-sm btn-primary"
                              >
                                Ver Anexo 2/3
                              </button>

                              <button
                                onClick={() =>
                                  getDoc(r.idGestion, "calendario")
                                }
                                className="btn btn-sm btn-primary"
                              >
                                Ver Calendario
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="col-4">
                          <div>
                            <p className="text-sm text-muted mb-0">
                              Evaluación
                            </p>
                            <button
                              onClick={() => getEvaluation(r.idGestion)}
                              className="btn btn-sm btn-primary"
                            >
                              {r.idEvaluacion !== null ? "Ver" : "Evaluar"}
                            </button>
                          </div>
                        </div>

                        <div className="col-4">
                          {r.notaTotal && (
                            <div>
                              <p className="text-sm text-muted mb-0">
                                Nota Total
                              </p>
                              <p>
                                {r.notaTotal !== null
                                  ? r.notaTotal.toFixed(2)
                                  : "—"}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="row mt-2">
                        <div className="col-12">
                          <p className="text-sm text-muted mb-0">Firmados:</p>

                          <div className="d-flex gap-3 mt-1">
                            <span>
                              A2/A3:{" "}
                              {r.anexo2FirmadoRecibido ||
                              r.anexo3FirmadoRecibido
                                ? "✅"
                                : "❌"}
                            </span>

                            <span>
                              Calendario: {r.calendarioComprobado ? "✅" : "❌"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {showDoc && (
          <div
            className="modal fade show"
            style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={closeDocViewer}
          >
            <div
              className="modal-dialog modal-xl"
              style={{ maxWidth: "90%", height: "90vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-content h-100">
                <div className="modal-header">
                  <h5 className="modal-title">
                    {showDoc.nombreAlumno} - {showDoc.nombre}
                  </h5>
                  <div className="ms-auto">
                    {(showDoc.tipo === "anexo2" ||
                      showDoc.tipo === "anexo3") && (
                      <button
                        onClick={validateDoc}
                        className="btn btn-success me-2"
                      >
                        Validar
                      </button>
                    )}
                    <button
                      onClick={() => window.open(showDoc.url, "_blank")}
                      className="btn btn-success me-2"
                    >
                      Abrir en nueva pestaña
                    </button>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={closeDocViewer}
                    ></button>
                  </div>
                </div>
                <div
                  className="modal-body p-0"
                  style={{ height: "calc(100% - 56px)" }}
                >
                  <iframe
                    src={showDoc.url}
                    title={`Documento de ${showDoc.nombreAlumno}`}
                    width="100%"
                    height="100%"
                    style={{ border: "none" }}
                  >
                    <p>
                      Tu navegador no soporta la visualización de PDFs.
                      <a href={showDoc.url} download>
                        Descarga el documento
                      </a>
                      para verlo.
                    </p>
                  </iframe>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkStudents;
