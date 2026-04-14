import { useState } from "react";
import { IoMdArrowDropdown } from "react-icons/io";

// Dropdown colapsable con animación suave de altura mediante grid-template-rows.
const Dropdown = ({ title, subtitle, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="form-card !mb-0">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div>
          <div className="form-section-title !mb-0">{title}</div>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1 ml-4">{subtitle}</p>
          )}
        </div>
        <div
          className={`toggle-btn transition-transform duration-300 ${
            open ? "rotate-180" : "rotate-0"
          }`}
        >
          <IoMdArrowDropdown className="text-lg" />
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Dropdown;
