const TONE = {
  error: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  success: "border-green-200 bg-green-50 text-green-800",
  info: "border-surface-200 bg-surface-50 text-charcoal-800",
};

const InlineNotice = ({ tone = "error", children, className = "" }) => {
  if (!children) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-2 text-sm ${TONE[tone] || TONE.error} ${className}`}
    >
      {children}
    </p>
  );
};

export default InlineNotice;
