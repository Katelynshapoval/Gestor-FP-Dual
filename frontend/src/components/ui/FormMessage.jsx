// Temporary success alert rendered below forms after a successful submission
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
