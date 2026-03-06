import { useEffect, useState, useRef } from "react";
import { useUser } from "../../globales/User";
import { useNavigate } from "react-router-dom";
import { buildPostOptions, postJSON } from "../../utils/api.js";
import { ofuscarId } from "../../utils/idObfuscation.js";
import StudentCard from "./StudentCard.jsx";
import DocViewer from "./DocViewer.jsx";
import "./LinkStudents.css";

// PÁGINA principal de vinculación de alumnos con empresas.
const LinkStudents = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [linkRequests, setLinkRequests] = useState([]);
  const [companyRequests, setCompanyRequests] = useState([]);
  const [showDoc, setShowDoc] = useState(null);
  const [currentDocUrl, setCurrentDocUrl] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [sendingInfo, setSendingInfo] = useState(new Set());
  const [selectedSpeciality, setSelectedSpeciality] = useState("");
  const [empresa1, setEmpresa1] = useState([]);
  const [empresa2, setEmpresa2] = useState([]);
  const [empresa3, setEmpresa3] = useState([]);

  // Ref para acceder a las specialities dentro de las funciones de refresco
  // sin que cambiar de referencia cause re-renders
  const specialitiesRef = useRef(user?.specialities);
  useEffect(() => {
    specialitiesRef.current = user?.specialities;
  }, [user]);

  useEffect(() => {
    setExpandedCards(new Set());
  }, [selectedSpeciality]);

  // Funciones de fetch definidas fuera de cualquier useEffect y sin deps de arrays,
  // leen las specialities desde el ref para evitar el bucle infinito
  const fetchCompanyRequests = () => {
    fetch(
      "/getCompanyRequests",
      buildPostOptions({ specialities: specialitiesRef.current }),
    )
      .then((r) => r.json())
      .then(setCompanyRequests)
      .catch(console.error);
  };

  const fetchLinkRequests = () => {
    fetch(
      "/linkStudents",
      buildPostOptions({ specialities: specialitiesRef.current }),
    )
      .then((r) => r.json())
      .then((data) => {
        setLinkRequests(data);
        setEmpresa1(
          data.map((r) => ({
            idGestion: r.idGestion,
            idEmpresa1: r.idEmpresa1,
            em1: r.em1,
          })),
        );
        setEmpresa2(
          data.map((r) => ({
            idGestion: r.idGestion,
            idEmpresa2: r.idEmpresa2,
            em2: r.em2,
          })),
        );
        setEmpresa3(
          data.map((r) => ({
            idGestion: r.idGestion,
            idEmpresa3: r.idEmpresa3,
            em3: r.em3,
          })),
        );
      })
      .catch(console.error);
  };

  // Se ejecuta una sola vez al montar el componente
  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchCompanyRequests();
    fetchLinkRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const getAnexo = (r) => {
    if (r.anexo2FirmadoRecibido) getDoc(r.idGestion, "anexo2");
    else if (r.anexo3FirmadoRecibido) getDoc(r.idGestion, "anexo3");
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
      next.has(id) ? next.delete(id) : next.add(id);
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
        const n = new Set(prev);
        n.delete(buttonId);
        return n;
      });
    }
  };

  const handleCompanyChange = (idGestion, slot) => (event) => {
    const idEmpresa = parseInt(event.target.value, 10);
    const nombre =
      companyRequests.find((cr) => cr.idEmpresa === idEmpresa)?.empresa ?? "";
    const setters = { 1: setEmpresa1, 2: setEmpresa2, 3: setEmpresa3 };
    const idKey = { 1: "idEmpresa1", 2: "idEmpresa2", 3: "idEmpresa3" };
    const nKey = { 1: "em1", 2: "em2", 3: "em3" };
    setters[slot]?.((prev) =>
      prev.map((item) =>
        item.idGestion === idGestion
          ? { ...item, [idKey[slot]]: idEmpresa, [nKey[slot]]: nombre }
          : item,
      ),
    );
  };

  const assign = async (idGestion, slot) => {
    const data = { 1: empresa1, 2: empresa2, 3: empresa3 };
    const ep = {
      1: "/updateCompany1",
      2: "/updateCompany2",
      3: "/updateCompany3",
    };
    const ik = { 1: "idEmpresa1", 2: "idEmpresa2", 3: "idEmpresa3" };
    const ed = data[slot]?.find((i) => i.idGestion === idGestion);
    if (!ed) return;
    const res = await fetch(
      ep[slot],
      buildPostOptions({ idGestion, idEmpresa: ed[ik[slot]] }),
    );
    if (!res.ok) return;
    fetchCompanyRequests();
    fetchLinkRequests();
  };

  const specialities = [
    ...new Set(linkRequests.filter((r) => r.nombreEsp).map((r) => r.nombreEsp)),
  ];
  const filtered = linkRequests.filter(
    (r) => !selectedSpeciality || r.nombreEsp === selectedSpeciality,
  );
  const canSendInfo = user?.specialities[0] == null;

  return (
    <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1">
      <div className="flex items-center justify-between">
        <div className="border-l-4 border-red-600 pl-5">
          <h1 className="text-2xl font-semibold">Peticiones de alumnos</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} alumno{filtered.length !== 1 ? "s" : ""}
            {/* {selectedSpeciality ? `en ${selectedSpeciality}` : "en total"} */}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[0.8rem] font-semibold whitespace-nowrap text-[var(--text-muted)] ">
            Especialidad:
          </label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all duration-200 ease-in-out"
            value={selectedSpeciality}
            onChange={(e) => setSelectedSpeciality(e.target.value)}
          >
            <option value="">Todas</option>
            {specialities.map((esp) => (
              <option key={esp} value={esp}>
                {esp}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="text-center p-12 text-gray-500 bg-gray-50 border border-gray-200 rounded-xl">
            No hay alumnos que coincidan con el filtro.
          </div>
        )}

        {filtered.map((r) => (
          <StudentCard
            key={`${r.idGestion}-${r.dni}`}
            r={r}
            isExpanded={expandedCards.has(r.idGestion)}
            onToggle={toggleCard}
            companyRequests={companyRequests}
            sendingInfo={sendingInfo}
            canSendInfo={canSendInfo}
            onAssign={assign}
            onSendInfo={sendInfo}
            onCompanyChange={handleCompanyChange}
            onGetDoc={getDoc}
            onGetAnexo={getAnexo}
            onGetEvaluation={(id) => navigate(`/evaluate/${ofuscarId(id)}`)}
            user={user}
          />
        ))}
      </div>

      <DocViewer
        showDoc={showDoc}
        onClose={closeDocViewer}
        onValidate={validateDoc}
      />
    </div>
  );
};

export default LinkStudents;
