import {
  RxCheck,
  RxCross2,
  RxClock,
  RxPaperPlane,
  RxExclamationTriangle,
  RxMinus,
} from "react-icons/rx";

import { statusIconClass } from "../../../components/ui/cardStyles";

export const ESTADO_CLASSES = {
  0: "bg-sky-100 text-sky-700",
  1: "bg-gray-100 text-gray-700",
  2: "bg-blue-50 text-blue-700",
  3: "bg-red-50 text-red-600",
  4: "bg-amber-50 text-amber-600",
  5: "bg-green-50 text-green-700",
};

export const ESTADO_ICONS = {
  5: { icon: RxCheck, color: "text-green-600" },
  3: { icon: RxCross2, color: "text-red-600" },
  1: { icon: RxClock, color: "text-orange-500" },
  2: { icon: RxPaperPlane, color: "text-blue-600" },
  4: { icon: RxExclamationTriangle, color: "text-yellow-600" },
};

export const ESTADO_TOOLTIPS = {
  5: "Finalizado / Aceptado",
  3: "Rechazado",
  1: "Asignado (no finalizado)",
  2: "Información enviada",
  4: "Pendiente",
};

export const getEmpresaIcon = (estid) => {
  const item = ESTADO_ICONS[estid];
  if (!item) {
    return <RxMinus className={`${statusIconClass} text-gray-400`} />;
  }
  const Icon = item.icon;
  return <Icon className={`${statusIconClass} ${item.color}`} />;
};

export const getEmpresaTooltip = (estid) =>
  ESTADO_TOOLTIPS[estid] ?? "Sin asignar";

export const getEstadoClass = (estid) =>
  ESTADO_CLASSES[estid] ?? ESTADO_CLASSES[1];
