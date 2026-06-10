import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useUser } from "../../../globales/User";
import { buildPostOptions, postJSON } from "../../../utils/api.js";

const mapEmpresaSlot = (data, slot) =>
  data.map((row) => ({
    idGestion: row.idGestion,
    [`idEmpresa${slot}`]: row[`idEmpresa${slot}`],
    [`em${slot}`]: row[`em${slot}`],
  }));

const ASSIGN_ENDPOINTS = {
  1: "/updateCompany1",
  2: "/updateCompany2",
  3: "/updateCompany3",
};

const EMPRESA_ID_KEYS = {
  1: "idEmpresa1",
  2: "idEmpresa2",
  3: "idEmpresa3",
};

const EMPRESA_NAME_KEYS = { 1: "em1", 2: "em2", 3: "em3" };

// Gestión de datos, filtros y acciones de la página de vinculación
export const useLinkStudents = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  const [linkRequests, setLinkRequests] = useState([]);
  const [companyRequests, setCompanyRequests] = useState([]);
  const [showDoc, setShowDoc] = useState(null);
  const [currentDocUrl, setCurrentDocUrl] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [sendingInfo, setSendingInfo] = useState(new Set());
  const [selectedSpeciality, setSelectedSpeciality] = useState("");
  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear()),
  );
  const [empresa1, setEmpresa1] = useState([]);
  const [empresa2, setEmpresa2] = useState([]);
  const [empresa3, setEmpresa3] = useState([]);

  const specialitiesRef = useRef(user?.specialities);
  const userRef = useRef(user);
  const yearRef = useRef(String(new Date().getFullYear()));
  const skipYearRefetch = useRef(true);

  useEffect(() => {
    specialitiesRef.current = user?.specialities;
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    setExpandedCards(new Set());
  }, [selectedSpeciality, selectedYear]);

  const fetchCompanyRequests = () => {
    fetch(
      "/getCompanyRequests",
      buildPostOptions({ specialities: specialitiesRef.current }),
    )
      .then((r) => r.json())
      .then(setCompanyRequests)
      .catch(console.error);
  };

  const fetchLinkRequests = (overrideYear) => {
    const currentUser = userRef.current;
    const body = {
      specialities: specialitiesRef.current,
      user_type: currentUser?.user_type,
      idUser: currentUser?.idUser,
      email: currentUser?.email,
      year: overrideYear ?? yearRef.current,
    };

    fetch("/linkStudents", buildPostOptions(body))
      .then((r) => r.json())
      .then((data) => {
        setLinkRequests(data);
        setEmpresa1(mapEmpresaSlot(data, 1));
        setEmpresa2(mapEmpresaSlot(data, 2));
        setEmpresa3(mapEmpresaSlot(data, 3));
      })
      .catch(console.error);
  };

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchCompanyRequests();
    fetchLinkRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    yearRef.current = selectedYear;
    if (skipYearRefetch.current) {
      skipYearRefetch.current = false;
      return;
    }
    fetchLinkRequests(selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  const getDoc = (idGestion, tipo) => {
    const rutas = {
      cv: `/linkStudents/${idGestion}/cv`,
      anexo2: `/linkStudents/${idGestion}/anexo2`,
      anexo3: `/linkStudents/${idGestion}/anexo3`,
    };
    if (!rutas[tipo]) return;

    fetch(rutas[tipo])
      .then((res) => {
        if (!res.ok) throw new Error("Error al obtener el documento");
        return res.blob();
      })
      .then((blob) => {
        if (currentDocUrl) URL.revokeObjectURL(currentDocUrl);
        const url = URL.createObjectURL(blob);
        setCurrentDocUrl(url);
        setShowDoc({
          tipo,
          url,
          nombre: `${tipo.toUpperCase()} - ${idGestion}`,
          nombreAlumno:
            linkRequests.find((r) => r.idGestion === idGestion)?.nombre ?? "",
        });
      })
      .catch((err) => alert(err.message));
  };

  const getAnexo = (row) => {
    if (row.anexo2FirmadoRecibido) getDoc(row.idGestion, "anexo2");
    else if (row.anexo3FirmadoRecibido) getDoc(row.idGestion, "anexo3");
    else alert("No hay Anexo 2 o 3 disponible.");
  };

  const closeDocViewer = () => {
    if (currentDocUrl) {
      URL.revokeObjectURL(currentDocUrl);
      setCurrentDocUrl(null);
    }
    setShowDoc(null);
  };

  const validateDoc = async () => {
    const idGestion = showDoc.nombre.split(" - ")[1];
    await fetch(`/linkStudents/${idGestion}/${showDoc.tipo}/validate`);
    closeDocViewer();
    fetchLinkRequests();
  };

  const toggleCard = (id) =>
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sendInfo = async (idGestion, idAlumno, idEmpresa) => {
    const buttonId = `${idGestion}-${idEmpresa}`;
    if (sendingInfo.has(buttonId)) return;

    setSendingInfo((prev) => new Set([...prev, buttonId]));
    try {
      await postJSON("/sendMail", {
        idGestion,
        idAlumno,
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

  const handleCompanyChange = (idGestion, slot) => (event) => {
    const idEmpresa = parseInt(event.target.value, 10);
    const nombre =
      companyRequests.find((cr) => cr.idEmpresa === idEmpresa)?.empresa ?? "";
    const setters = { 1: setEmpresa1, 2: setEmpresa2, 3: setEmpresa3 };
    const idKey = EMPRESA_ID_KEYS[slot];
    const nameKey = EMPRESA_NAME_KEYS[slot];

    setters[slot]?.((prev) =>
      prev.map((item) =>
        item.idGestion === idGestion
          ? { ...item, [idKey]: idEmpresa, [nameKey]: nombre }
          : item,
      ),
    );
  };

  const assign = async (idGestion, slot) => {
    const data = { 1: empresa1, 2: empresa2, 3: empresa3 };
    const row = data[slot]?.find((item) => item.idGestion === idGestion);
    if (!row) return;

    const res = await fetch(
      ASSIGN_ENDPOINTS[slot],
      buildPostOptions({
        idGestion,
        idEmpresa: row[EMPRESA_ID_KEYS[slot]],
      }),
    );
    if (!res.ok) return;

    fetchCompanyRequests();
    fetchLinkRequests();
  };

  const specialities = [
    ...new Set(
      linkRequests.filter((r) => r.nombreEsp).map((r) => r.nombreEsp),
    ),
  ];

  const filtered = linkRequests.filter(
    (r) => !selectedSpeciality || r.nombreEsp === selectedSpeciality,
  );

  const canSendInfo = user?.specialities?.[0] == null;
  const isEmpresa = user?.user_type === "empresa";
  const yearOptionCount = isEmpresa ? 3 : 5;

  return {
    user,
    navigate,
    linkRequests,
    companyRequests,
    showDoc,
    expandedCards,
    sendingInfo,
    selectedSpeciality,
    setSelectedSpeciality,
    selectedYear,
    setSelectedYear,
    filtered,
    specialities,
    canSendInfo,
    isEmpresa,
    yearOptionCount,
    toggleCard,
    assign,
    sendInfo,
    handleCompanyChange,
    getDoc,
    getAnexo,
    closeDocViewer,
    validateDoc,
  };
};
