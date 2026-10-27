import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../../context/UserContext";
import { useToast } from "../../../components/feedback/ToastProvider.jsx";
import { getJSON, postJSON } from "../../../utils/api.js";
import { useUrlFilters } from "../../../hooks/useUrlFilters.js";
import { useConvocatoriaEstado } from "../../../hooks/useConvocatoriaEstado.js";
import { coincide } from "../../../utils/busqueda.js";
import { isCancelledReserva, isConfirmedReserva } from "../../../utils/reservaEstados.js";

export const CONVOCATORIA_ACTIVA = "activa";
export const CONVOCATORIA_TODAS = "todas";
const FILTER_DEFAULTS = { q: "", convocatoria: CONVOCATORIA_ACTIVA, especialidad: "", estado: "", reserva: "" };

// Reservation situation of one application, for the "Reserva" filter.
export function situacionReserva(r) {
  const activas = (r.reservas || []).filter((x) => !isCancelledReserva(x.estado_reserva));
  if (activas.some((x) => isConfirmedReserva(x.estado_reserva))) return "CONFIRMADA";
  if (activas.length) return "PENDIENTE";
  return "SIN_RESERVA";
}

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
  const { filters, setFilter, reset: resetFilters, active: filtersActive } = useUrlFilters(FILTER_DEFAULTS);
  const convocatoriaEstado = useConvocatoriaEstado();
  const activaNombre = convocatoriaEstado.data?.activa?.nombre || null;

  const isEmpresa = user?.rol === "EMPRESA";
  const loadedRef = useRef(false);
  const requestRef = useRef(0);

  useEffect(() => {
    setExpandedCards(new Set());
  }, [filters.q, filters.convocatoria, filters.especialidad, filters.estado, filters.reserva]);

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
    ...new Set(linkRequests.filter((r) => r.especialidad).map((r) => r.especialidad)),
  ].sort((a, b) => a.localeCompare(b, "es"));

  const convocatorias = [
    ...new Set(linkRequests.filter((r) => r.convocatoria).map((r) => r.convocatoria)),
  ].sort((a, b) => b.localeCompare(a));

  // "activa" resolves to the active convocatoria; with none active, all are shown.
  const convocatoriaFiltro =
    filters.convocatoria === CONVOCATORIA_TODAS
      ? ""
      : filters.convocatoria === CONVOCATORIA_ACTIVA
        ? activaNombre || ""
        : filters.convocatoria;

  const filtered = linkRequests.filter((r) => {
    if (filters.especialidad && r.especialidad !== filters.especialidad) return false;
    if (isEmpresa) {
      return coincide(filters.q, [r.nombre, r.dni, r.especialidad]);
    }
    if (convocatoriaFiltro && r.convocatoria !== convocatoriaFiltro) return false;
    if (filters.estado && r.estado_validacion !== filters.estado) return false;
    if (filters.reserva && situacionReserva(r) !== filters.reserva) return false;
    return coincide(filters.q, [
      r.nombre,
      r.dni,
      r.email,
      r.especialidad,
      ...(r.reservas || []).map((x) => x.empresa),
    ]);
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
    filters,
    setFilter,
    resetFilters,
    filtersActive,
    activaNombre,
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
