import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../../context/UserContext";
import { useToast } from "../../../components/feedback/ToastProvider.jsx";
import { getJSON, postJSON } from "../../../utils/api.js";

// Data, filters and actions for the student-linking module.
//
// WF-14: loading, errors and "empty" are separate states, and for companies
// the application status is its own request, so a failed call is shown as an
// error (with retry) and never as "your company is not validated".
//   status:      "loading" | "ready" | "error"
//   companyState (EMPRESA): "loading" | "SIN_SOLICITUD" | "PENDIENTE" |
//                "VALIDADO" | "RECHAZADO" | "error"
export const useLinkStudents = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const toast = useToast();

  // Staff sees all student applications; empresa sees available students for its specialities
  const [linkRequests, setLinkRequests] = useState([]);
  // Quota offers for the authenticated empresa (empresa role only)
  const [companyOffers, setCompanyOffers] = useState([]);
  const [companyState, setCompanyState] = useState("loading");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [expandedCards, setExpandedCards] = useState(new Set());
  const [selectedSpeciality, setSelectedSpeciality] = useState("");
  const [selectedConvocatoria, setSelectedConvocatoria] = useState("");

  const isEmpresa = user?.rol === "EMPRESA";
  const loadedRef = useRef(false);
  const requestRef = useRef(0);

  useEffect(() => {
    setExpandedCards(new Set());
  }, [selectedSpeciality, selectedConvocatoria]);

  // First load shows the loading state; later refreshes keep the list on
  // screen so cards do not collapse after every action.
  const fetchLinkRequests = useCallback(async () => {
    const requestId = ++requestRef.current;
    const first = !loadedRef.current;
    if (first) setStatus("loading");
    else setRefreshing(true);
    setError(null);
    try {
      if (isEmpresa) {
        let estado;
        try {
          const solicitud = await getJSON("/solicitudes/empresa/mia");
          estado = solicitud?.estado_validacion || "PENDIENTE";
        } catch (err) {
          if (err.status === 404 && err.code === "SIN_SOLICITUD") estado = "SIN_SOLICITUD";
          else throw err;
        }
        if (requestId !== requestRef.current) return;
        setCompanyState(estado);
        if (estado === "VALIDADO") {
          const [alumnos, cupos] = await Promise.all([getJSON("/alumnos/disponibles"), getJSON("/cupos/empresa")]);
          if (requestId !== requestRef.current) return;
          setLinkRequests(Array.isArray(alumnos) ? alumnos : []);
          setCompanyOffers(Array.isArray(cupos) ? cupos : []);
        } else {
          setLinkRequests([]);
          setCompanyOffers([]);
        }
      } else {
        const data = await getJSON("/solicitudes/alumno?include=full");
        if (requestId !== requestRef.current) return;
        setLinkRequests(Array.isArray(data) ? data : []);
      }
      loadedRef.current = true;
      setStatus("ready");
    } catch (err) {
      if (requestId !== requestRef.current) return;
      if (isEmpresa && !loadedRef.current) setCompanyState("error");
      setError(err);
      if (first) setStatus("error");
      else toast.error(err.message || "No se pudieron actualizar los datos.");
    } finally {
      if (requestId === requestRef.current) setRefreshing(false);
    }
  }, [isEmpresa, toast]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchLinkRequests();
  }, [user, navigate, fetchLinkRequests]);

  const validateAlumno = useCallback(
    async (idSolicitudAlumno) => {
      await postJSON(`/solicitudes/alumno/${idSolicitudAlumno}/validar`, {});
      await fetchLinkRequests();
    },
    [fetchLinkRequests],
  );

  const rejectSolicitud = useCallback(
    async (idSolicitudAlumno, motivo) => {
      await postJSON(`/solicitudes/alumno/${idSolicitudAlumno}/rechazar`, {
        motivo,
      });
      await fetchLinkRequests();
    },
    [fetchLinkRequests],
  );

  // D7: staff reopen a rejected application (active convocatoria only).
  const reopenSolicitud = useCallback(
    async (idSolicitudAlumno, motivo) => {
      await postJSON(`/solicitudes/alumno/${idSolicitudAlumno}/reabrir`, motivo ? { motivo } : {});
      await fetchLinkRequests();
    },
    [fetchLinkRequests],
  );

  const toggleCard = (id) =>
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reserveStudent = async (
    idSolicitudAlumno,
    idSolicitudEmpresaEspecialidad,
  ) => {
    try {
      await postJSON("/reservas", {
        id_solicitud_alumno: idSolicitudAlumno,
        id_solicitud_empresa_especialidad: idSolicitudEmpresaEspecialidad,
      });
      toast.success("Reserva creada.");
      await fetchLinkRequests();
    } catch (err) {
      toast.error(err.message || "Error al reservar el alumno.");
    }
  };

  // Company cancels its own pending reservation; errors stay in the dialog.
  const cancelReservation = async (idReserva, motivo) => {
    await postJSON(`/reservas/${idReserva}/cancelar`, { motivo });
    toast.success("Reserva cancelada correctamente.");
    await fetchLinkRequests();
  };

  const adminReserve = async (
    idSolicitudAlumno,
    idSolicitudEmpresaEspecialidad,
  ) => {
    try {
      await postJSON("/reservas/admin", {
        id_solicitud_alumno: idSolicitudAlumno,
        id_solicitud_empresa_especialidad: idSolicitudEmpresaEspecialidad,
      });
      toast.success("Reserva creada.");
      await fetchLinkRequests();
    } catch (err) {
      toast.error(err.message || "Error al reservar el alumno.");
    }
  };

  const specialities = [
    ...new Set(
      linkRequests.filter((r) => r.especialidad).map((r) => r.especialidad),
    ),
  ];

  const convocatorias = [
    ...new Set(
      linkRequests.filter((r) => r.convocatoria).map((r) => r.convocatoria),
    ),
  ];

  const filtered = linkRequests.filter((r) => {
    if (selectedSpeciality && r.especialidad !== selectedSpeciality)
      return false;
    if (
      !isEmpresa &&
      selectedConvocatoria &&
      r.convocatoria !== selectedConvocatoria
    )
      return false;
    return true;
  });

  return {
    user,
    status,
    error,
    refreshing,
    linkRequests,
    companyOffers,
    companyState,
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
    validateAlumno,
    rejectSolicitud,
    reopenSolicitud,
    reserveStudent,
    cancelReservation,
    adminReserve,
    fetchLinkRequests,
  };
};
