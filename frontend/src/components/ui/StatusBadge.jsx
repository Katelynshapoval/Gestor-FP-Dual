const variants = {
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  neutral: "border-surface-200 bg-surface-50 text-muted",
  brand: "border-brand-200 bg-brand-50 text-brand-800",
};

const StatusBadge = ({ children, variant = "neutral", className = "" }) => (
  <span
    className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${variants[variant] || variants.neutral} ${className}`}
  >
    {children}
  </span>
);

export default StatusBadge;
