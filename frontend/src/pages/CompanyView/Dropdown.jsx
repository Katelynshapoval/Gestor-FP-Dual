import { useState, useEffect, useRef } from "react";
import { IoMdArrowDropdown } from "react-icons/io";

// Dropdown colapsable con animación suave de altura.
const Dropdown = ({ title, subtitle, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef(null);
  const [height, setHeight] = useState(defaultOpen ? "auto" : "0px");

  useEffect(() => {
    if (open) {
      const scrollH = contentRef.current.scrollHeight;
      setHeight(`${scrollH}px`);
      const timer = setTimeout(() => setHeight("auto"), 350);
      return () => clearTimeout(timer);
    } else {
      const scrollH = contentRef.current.scrollHeight;
      setHeight(`${scrollH}px`);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight("0px"));
      });
    }
  }, [open]);

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
          className="toggle-btn"
          style={{
            transition: "transform 0.3s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <IoMdArrowDropdown className="text-lg" />
        </div>
      </div>

      <div
        ref={contentRef}
        style={{
          height,
          overflow: "hidden",
          transition: "height 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="pt-6">{children}</div>
      </div>
    </div>
  );
};

export default Dropdown;
