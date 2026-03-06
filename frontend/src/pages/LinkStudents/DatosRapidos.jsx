import {
  MdOutlineEmail,
  MdOutlineLocalPhone,
  MdOutlineDirectionsCar,
  MdOutlineCancel,
} from "react-icons/md";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";

const DatosRapidos = ({ r }) => {
  return (
    <div>
      <p className="section-label">Datos rápidos</p>

      <div className="flex flex-col gap-6 text-sm bg-white border border-[var(--border)] rounded-lg p-4">
        {/* Email */}
        <div className="flex gap-3">
          <MdOutlineEmail className="text-red-500 text-xl mt-1" />

          <div className="flex flex-col">
            <span className="text-xs font-semibold text-muted">Email</span>
            <span className="font-medium">{r.email || "—"}</span>
          </div>
        </div>

        {/* Teléfono */}
        <div className="flex gap-3">
          <MdOutlineLocalPhone className="text-red-500 text-xl mt-1" />

          <div className="flex flex-col">
            <span className="text-xs font-semibold text-muted">Teléfono</span>
            <span className="font-medium">{r.telalumno || "—"}</span>
          </div>
        </div>

        {/* Movilidad */}
        <div className="flex gap-3">
          <MdOutlineDirectionsCar className="text-red-500 text-xl mt-1" />

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Movilidad</span>

            <div className="flex gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-md font-medium flex items-center gap-1 ${
                  r.carnetDeConducir
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {r.carnetDeConducir ? (
                  <IoIosCheckmarkCircleOutline />
                ) : (
                  <MdOutlineCancel />
                )}
                Carnet
              </span>

              <span
                className={`text-xs px-2 py-0.5 rounded-md font-medium flex items-center gap-1 ${
                  r.tieneCoche
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {r.tieneCoche ? (
                  <IoIosCheckmarkCircleOutline />
                ) : (
                  <MdOutlineCancel />
                )}
                Vehículo
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatosRapidos;
