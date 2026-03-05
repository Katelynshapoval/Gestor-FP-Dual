// Campos del tutor legal, visibles únicamente cuando el alumno es menor de edad.
const LegalGuardianFields = ({ legalGuardianName, legalGuardianDni, onNameChange, onDniChange }) => (
  <>
    <div className="field">
      <label htmlFor="lgName">Nombre del Tutor Legal</label>
      <input id="lgName" className="input" value={legalGuardianName} onChange={onNameChange} maxLength={45} required />
    </div>
    <div className="field">
      <label htmlFor="lgDni">DNI del Tutor Legal</label>
      <input id="lgDni" className="input" value={legalGuardianDni} onChange={onDniChange}
        pattern="[A-Z0-9]{9,10}" maxLength={10} required />
    </div>
  </>
);
export default LegalGuardianFields;
