import { LuFileText } from "react-icons/lu";

export const documentViewActionClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-charcoal-700 outline-none transition-[border-color,box-shadow,color] duration-150 ease-out hover:border-surface-300 hover:bg-white hover:text-charcoal-900 focus-visible:ring-2 focus-visible:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-40";

// Acción compacta para abrir o ver un documento existente
const DocumentViewAction = ({ children, className = "", iconClassName = "h-3.5 w-3.5 shrink-0 text-muted", ...props }) => (
  <button type="button" className={`${documentViewActionClass} ${className}`.trim()} {...props}>
    <LuFileText className={iconClassName} aria-hidden="true" />
    {children}
  </button>
);

export default DocumentViewAction;
