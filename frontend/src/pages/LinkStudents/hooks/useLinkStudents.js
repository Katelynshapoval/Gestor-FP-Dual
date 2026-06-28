import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../../globales/User";
import { getBlob, getJSON, postJSON } from "../../../utils/api.js";

// Gestión de datos, filtros y acciones del módulo de vinculación.
// Sustituye el modelo de 3 slots fijos por el modelo dinámico de reservas.
export const useLinkStudents = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  // Lista principal de solicitudes de alumno (para staff) o alumnos disponibles (para empresa)
  const [linkRequests, setLinkRequests] = useState([]);
  // Ofertas de la empresa autenticada (solo para rol EMPRESA)
  const [companyOffers, setCompanyOffers] = useState([]);

  const [showDoc, setShowDoc] = useState(null);
  const [currentDocUrl, setCurrentDocUrl] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [sendingInfo, setSendingInfo] = useState(new Set());
  const [selectedSpeciality, setSelectedSpeciality] = useState("");
  const [selectedConvocatoria, setSelectedConvocatoria] = useState("");

  const isEmpresa = user?.rol === "EMPRESA";
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    setExpandedCards(new Set());
  }, [selectedSpeciality, selectedConvocatoria]);

  const fetchLinkRequests = useCallback(async () => {
    try {
      if (isEmpresa) {
        // La empresa ve los alumnos disponibles para sus especialidades
        const [alumnos, cupos] = await Promise.all([
          getJSON("/alumnos/disponibles"),
          getJSON("/cupos/empresa"),
        ]);
        setLinkRequests(Array.isArray(alumnos) ? alumnos : []);
        setCompanyOffers(Array.isArray(cupos) ? cupos : []);
      } else {
        // Staff ve todas las solicitudes con reservas y evaluaciones incluidas
        const data = await getJSON("/solicitudes/alumno?include=full");
        setLinkRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error al cargar solicitudes:", err);
    }
  }, [isEmpresa]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchLinkRequests();
  }, [user, navigate, fetchLinkRequests]);

  // Descarga un documento por su ID y lo muestra en el visor
  const getDoc = useCallback((idDocumento, tipo, nombreAlumno) => {
    if (!idDocumento) {
      alert("No hay documento disponible.");
      return;
    }

    getBlob(`/documentos/${idDocumento}/descargar`)
      .then((blob) => {
        if (currentDocUrl) URL.revokeObjectURL(currentDocUrl);
        const url = URL.createObjectURL(blob);
        setCurrentDocUrl(url);
        setShowDoc({
          tipo,
          url,
          idDocumento,
          nombre: tipo.toUpperCase(),
          nombreAlumno: nombreAlumno || "",
        });
      })
      .catch((err) => alert(err.message));
  }, [currentDocUrl]);

  // Cierra el visor de documentos y libera la URL
  const closeDocViewer = useCallback(() => {
    if (currentDocUrl) {
      URL.revokeObjectURL(currentDocUrl);
      setCurrentDocUrl(null);
    }
    setShowDoc(null);
  }, [currentDocUrl]);

  // Valida el documento que se está viendo
  const validateDoc = useCallback(async () => {
    if (!showDoc?.idDocumento) return;
    try {
      await postJSON(`/documentos/${showDoc.idDocumento}/validar`, {});
      closeDocViewer();
      fetchLinkRequests();
    } catch (err) {
      alert(err.message);
    }
  }, [showDoc, closeDocViewer, fetchLinkRequests]);

  const toggleCard = (id) =>
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Envía información del alumno a la empresa (staff)
  const sendInfo = async (idSolicitudAlumno, idEmpresa) => {
    const buttonId = `${idSolicitudAlumno}-${idEmpresa}`;
    if (sendingInfo.has(buttonId)) return;

    setSendingInfo((prev) => new Set([...prev, buttonId]));
    try {
      await postJSON("/sendMail", {
        idSolicitudAlumno,
        idEmpresa,
        url: window.location.origin,
      });
      fetchLinkRequests();
    } catch (err) {
      console.error("Error al enviar información:", err);
    } finally {
      setSendingInfo((prev) => {
        const next = new Set(prev);
        next.delete(buttonId);
        return next;
      });
    }
  };

  // Reserva un alumno (rol empresa)
  const reserveStudent = async (idSolicitudAlumno, idSolicitudEmpresaEspecialidad) => {
    try {
      await postJSON("/reservas", {
        id_solicitud_alumno: idSolicitudAlumno,
        id_solicitud_empresa_especialidad: idSolicitudEmpresaEspecialidad,
      });
      fetchLinkRequests();
    } catch (err) {
      alert(err.message || "Error al reservar el alumno.");
    }
  };

  // Cancela la reserva de un alumno (rol empresa)
  const cancelReservation = async (idReserva, motivo) => {
    try {
      await postJSON(`/reservas/${idReserva}/cancelar`, { motivo });
      fetchLinkRequests();
    } catch (err) {
      alert(err.message || "Error al cancelar la reserva.");
    }
  };

  // Lista de especialidades únicas para el filtro
  const specialities = [
    ...new Set(
      linkRequests.filter((r) => r.especialidad).map((r) => r.especialidad),
    ),
  ];

  // Lista de convocatorias únicas para el filtro (solo staff)
  const convocatorias = [
    ...new Set(
      linkRequests.filter((r) => r.convocatoria).map((r) => r.convocatoria),
    ),
  ];

  // Aplica filtros de especialidad y convocatoria
  const filtered = linkRequests.filter((r) => {
    if (selectedSpeciality && r.especialidad !== selectedSpeciality) return false;
    if (!isEmpresa && selectedConvocatoria && r.convocatoria !== selectedConvocatoria) return false;
    return true;
  });

  // El staff puede enviar info si no tiene especialidades restringidas (campo legado)
  const canSendInfo = !isEmpresa;

  return {
    user,
    navigate,
    linkRequests,
    companyOffers,
    showDoc,
    expandedCards,
    sendingInfo,
    selectedSpeciality,
    setSelectedSpeciality,
    selectedConvocatoria,
    setSelectedConvocatoria,
    filtered,
    specialities,
    convocatorias,
    canSendInfo,
    isEmpresa,
    toggleCard,
    sendInfo,
    getDoc,
    closeDocViewer,
    validateDoc,
    reserveStudent,
    cancelReservation,
  };
};
