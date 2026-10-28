import LongText from "./LongText.jsx";

// Read-only value with its label (D.2: read-only data must not look like an
// editable input). Replaces the copies in the company and student portals.
const ReadField = ({ label, value, className = "" }) => (
  <div className={`min-w-0 ${className}`}>
    <p className="break-words text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <p className="mt-0.5 min-w-0 break-words text-sm font-medium text-charcoal-900">
      {value === 0 || value ? <LongText>{value}</LongText> : "—"}
    </p>
  </div>
);

export default ReadField;
