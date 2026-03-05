// Mensaje de alerta temporal que aparece debajo de los formularios.
const FormMessage = ({ message }) => {
  if (!message) return null;
  return (
    <div className="form-message" role="alert">
      <span>✓</span>
      {message}
    </div>
  );
};

export default FormMessage;
