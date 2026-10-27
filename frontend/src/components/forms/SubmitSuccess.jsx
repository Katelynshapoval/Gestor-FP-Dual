import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { FaCircleCheck } from "react-icons/fa6";

// Confirmation that replaces a public form after a successful submission.
const SubmitSuccess = ({ title, children, onAnother, anotherLabel }) => {
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="form-card text-center" role="status">
      <FaCircleCheck aria-hidden="true" className="mx-auto h-10 w-10 text-green-700" />
      <h2 ref={ref} tabIndex={-1} className="mb-0 mt-4 text-xl font-semibold text-charcoal-950 outline-none">
        {title}
      </h2>
      <div className="mx-auto mt-3 max-w-xl text-sm leading-6 text-charcoal-800">{children}</div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/login" className="btn btn-primary">
          Acceder al portal
        </Link>
        {onAnother && (
          <button type="button" className="btn btn-secondary" onClick={onAnother}>
            {anotherLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default SubmitSuccess;
