// Inline form feedback. Validation problems stay here; successful submissions use toasts.
const FormMessage = ({ message, tone = "error" }) => {
  if (!message) return null;
  const error = tone === "error";
  return (
    <div className={error ? "form-message form-message-error" : "form-message"} role={error ? "alert" : "status"}>
      <span aria-hidden="true">{error ? "!" : "✓"}</span>
      {message}
    </div>
  );
};

export default FormMessage;
