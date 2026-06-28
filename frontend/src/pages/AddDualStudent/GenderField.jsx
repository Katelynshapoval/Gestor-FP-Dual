// Gender selector with free-text input for "Otro"
const GenderField = ({ gender, onChange }) => {
  const isOther = gender !== 'Hombre' && gender !== 'Mujer' && gender !== '';
  return (
    <div className="field">
      <label>Sexo</label>
      <div className="radio-group">
        {['Hombre', 'Mujer'].map((op) => (
          <label key={op} className="radio-option">
            <input type="radio" name="gender" value={op} checked={gender === op}
              onChange={onChange} required={op === 'Hombre'} />
            <span>{op}</span>
          </label>
        ))}
        <label className="radio-option">
          <input type="radio" name="gender" value="Otro" checked={isOther}
            onChange={() => onChange({ target: { value: 'Otro' } })} />
          <span>Otro</span>
        </label>
        {isOther && (
          <input className="input mt-1" maxLength={15}
            value={gender === 'Otro' ? '' : gender}
            onChange={(e) => onChange({ target: { value: e.target.value } })}
            placeholder="Especifica..." required />
        )}
      </div>
    </div>
  );
};
export default GenderField;
