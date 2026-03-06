// Campo de solo lectura para mostrar datos de la empresa.
const InfoField = ({ label, value }) => (
  <div className="field">
    <label>{label}</label>
    <p className="input bg-gray-50 cursor-default">{value || "—"}</p>
  </div>
);

export default InfoField;
