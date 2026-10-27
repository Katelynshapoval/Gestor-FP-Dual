// One place for the menu of each role, the page titles and each role's home
// page (D.1). Hiding an entry is not security: RequireRole and the backend
// decide access.
import {
  FaBuilding,
  FaCalendarDays,
  FaClipboardList,
  FaFileLines,
  FaGaugeHigh,
  FaHouse,
  FaRightToBracket,
  FaUserGraduate,
  FaUsers,
} from "react-icons/fa6";

export const STAFF = ["ADMINISTRADOR", "COORDINADOR"];
export const isStaff = (user) => STAFF.includes(user?.rol);

const PUBLIC_NAV = [
  { to: "/", label: "Inicio", Icon: FaHouse, end: true },
  { to: "/addDualStudent", label: "Solicitud de alumno", Icon: FaUserGraduate },
  { to: "/addCompanyRequest", label: "Solicitud de empresa", Icon: FaBuilding },
  { to: "/login", label: "Acceder", Icon: FaRightToBracket },
];

const STAFF_NAV = [
  { to: "/panel", label: "Panel", Icon: FaGaugeHigh },
  { to: "/alumnos", label: "Alumnos", Icon: FaUserGraduate },
  { to: "/empresas", label: "Empresas", Icon: FaBuilding },
  { to: "/reservas", label: "Reservas", Icon: FaClipboardList },
  { to: "/documentos", label: "Documentos", Icon: FaFileLines },
  { to: "/convocatorias", label: "Convocatorias", Icon: FaCalendarDays },
];

const EMPRESA_NAV = [
  { to: "/companyMain", label: "Mi empresa", Icon: FaBuilding },
  { to: "/alumnos", label: "Alumnos disponibles", Icon: FaUsers },
];

const ALUMNO_NAV = [{ to: "/studentMain", label: "Mi proceso Dual", Icon: FaUserGraduate }];

export function navForUser(user) {
  if (!user) return PUBLIC_NAV;
  if (isStaff(user)) return STAFF_NAV;
  if (user.rol === "EMPRESA") return EMPRESA_NAV;
  if (user.rol === "ALUMNO") return ALUMNO_NAV;
  return [];
}

export function homeForRole(rol) {
  if (rol === "ALUMNO") return "/studentMain";
  if (rol === "EMPRESA") return "/companyMain";
  if (STAFF.includes(rol)) return "/panel";
  return "/";
}

// A nav entry is active on its own path and on its sub-paths.
export function isActivePath(pathname, item) {
  if (item.end || item.to === "/") return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

// Document titles (WCAG 2.4.2); the role decides the wording of shared paths.
const TITLES = {
  "/": "Inicio",
  "/login": "Acceder",
  "/addDualStudent": "Solicitud de alumno",
  "/addCompanyRequest": "Solicitud de empresa",
  "/panel": "Panel",
  "/empresas": "Empresas",
  "/reservas": "Reservas",
  "/documentos": "Documentos",
  "/convocatorias": "Convocatorias",
  "/companyMain": "Mi empresa",
  "/studentMain": "Mi proceso Dual",
  "/cambiarPassword": "Cambiar contraseña",
};

export function pageTitle(pathname, user) {
  if (pathname === "/alumnos") return user?.rol === "EMPRESA" ? "Alumnos disponibles" : "Alumnos";
  return TITLES[pathname] || "FP Dual";
}
