import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../../context/UserContext";
import { getBlob, getJSON, postJSON } from "../../../utils/api.js";

// Data, filters and actions for the student-linking module.
// Replaces the legacy 3-slot model with the dynamic reservations model.
export const useLinkStudents = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  // Staff sees all student applications; empresa sees available students for its specialities
  const [linkRequests, setLinkRequests] = useState([]);
  // Quota offers for the authenticated empresa (empresa role only)
  const [companyOffers, setCompanyOffers] = useState([]);

  const [showDoc, setShowDoc] = useState(null);
  const [currentDocUrl, setCurrentDocUrl] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [selectedSpeciality, setSelectedSpeciality] = useState("");
  const [selectedConvocatoria, setSelectedConvocatoria] = useState("");

  const isEmpresa = user?.rol === "EMPRESA";
  const userRef = useRef(user);

  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    setExpandedCards(new Set());
  }, [selectedSpeciality, selectedConvocatoria]);

  const fetchLinkRequests = useCallback(async () => {
    try {
      if (isEmpresa) {
        const [alumnos, cupos] = await Promise.all([
          getJSON("/alumnos/disponibles"),
          getJSON("/cupos/empresa"),
        ]);
        setLinkRequests(Array.isArray(alumnos) ? alumnos : []);
        setCompanyOffers(Array.isArray(cupos) ? cupos : []);
      } else {
        const data = await getJSON("/solicitudes/alumno?include=full");
        setLinkRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error fetching link requests:", err);
    }
  }, [isEmpresa]);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    fetchLinkRequests();
  }, [user, navigate, fetchLinkRequests]);

  // Downloads a document blob and opens it in the inline viewer
  const getDoc = useCallback((idDocumento, tipo, nombreAlumno) => {
    if (!idDocumento) { alert("No hay documento disponible."); return; }
    getBlob(`/documentos/${idDocumento}/descargar`)
      .then((blob) => {
        if (currentDocUrl) URL.revokeObjectURL(currentDocUrl);
        const url = URL.createObjectURL(blob);
        setCurrentDocUrl(url);
        setShowDoc({ tipo, url, idDocumento, nombre: tipo.toUpperCase(), nombreAlumno: nombreAlumno || "" });
      })
      .catch((err) => alert(err.message));
  }, [currentDocUrl]);

  // Closes the document viewer and releases the object URL
  const closeDocViewer = useCallback(() => {
    if (currentDocUrl) { URL.revokeObjectURL(currentDocUrl); setCurrentDocUrl(null); }
    setShowDoc(null);
  }, [currentDocUrl]);

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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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

  const cancelReservation = async (idReserva, motivo) => {
    try {
      await postJSON(`/reservas/${idReserva}/cancelar`, { motivo });
      fetchLinkRequests();
    } catch (err) {
      alert(err.message || "Error al cancelar la reserva.");
    }
  };

  const specialities = [
    ...new Set(linkRequests.filter((r) => r.especialidad).map((r) => r.especialidad)),
  ];

  const convocatorias = [
    ...new Set(linkRequests.filter((r) => r.convocatoria).map((r) => r.convocatoria)),
  ];

  const filtered = linkRequests.filter((r) => {
    if (selectedSpeciality && r.especialidad !== selectedSpeciality) return false;
    if (!isEmpresa && selectedConvocatoria && r.convocatoria !== selectedConvocatoria) return false;
    return true;
  });

  return {
    user,
    navigate,
    linkRequests,
    companyOffers,
    showDoc,
    expandedCards,
    selectedSpeciality,
    setSelectedSpeciality,
    selectedConvocatoria,
    setSelectedConvocatoria,
    filtered,
    specialities,
    convocatorias,
    isEmpresa,
    toggleCard,
    getDoc,
    closeDocViewer,
    validateDoc,
    reserveStudent,
    cancelReservation,
  };
};
