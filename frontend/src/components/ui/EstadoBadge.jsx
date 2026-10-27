import StatusBadge from "./StatusBadge.jsx";
import { badge } from "../../utils/labels.js";

// StatusBadge driven by utils/labels.js: <EstadoBadge kind="reserva" value="PENDIENTE" />.
// `labelOverride` keeps the colour but changes the text (e.g. a backend label).
const EstadoBadge = ({ kind, value, labelOverride, className = "" }) => {
  const { label, variant } = badge(kind, value);
  return (
    <StatusBadge variant={variant} className={className}>
      {labelOverride || label}
    </StatusBadge>
  );
};

export default EstadoBadge;
