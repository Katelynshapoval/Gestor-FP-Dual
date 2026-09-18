const CambioDiff = ({ diff = [] }) => {
  if (!diff.length) {
    return <p className="text-sm text-gray-500">No hay campos distintos.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-surface-200">
      <div className="grid grid-cols-3 gap-2 bg-surface-50 px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
        <span>Campo</span>
        <span>Actual</span>
        <span>Solicitado</span>
      </div>
      {diff.map((row) => (
        <div key={row.field} className="grid grid-cols-3 gap-2 border-t border-surface-200 px-3 py-2 text-sm">
          <span className="font-medium text-charcoal-900">{row.label}</span>
          <span className="text-gray-500 whitespace-pre-wrap">{row.actual}</span>
          <span className="text-brand-800 whitespace-pre-wrap">{row.solicitado}</span>
        </div>
      ))}
    </div>
  );
};

export default CambioDiff;
