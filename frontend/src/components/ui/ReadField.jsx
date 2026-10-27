// Read-only value with its label (D.2: read-only data must not look like an
// editable input). Replaces the copies in the company and student portals.
const ReadField = ({ label, value, className = "" }) => (
  <div className={`min-w-0 ${className}`}>
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <p className="mt-1 break-words rounded-md bg-surface-50 px-3 py-2 text-sm text-charcoal-900">
      {value === 0 || value ? value : "—"}
    </p>
  </div>
);

export default ReadField;
