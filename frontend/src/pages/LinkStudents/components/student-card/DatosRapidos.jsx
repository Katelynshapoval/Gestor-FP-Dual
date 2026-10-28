import {
  MdOutlineEmail,
  MdOutlineLocalPhone,
  MdOutlineDirectionsCar,
  MdOutlineCancel,
} from "react-icons/md";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";

import { sectionLabelClass } from "../../../../components/ui/cardStyles";
import LongText from "../../../../components/ui/LongText.jsx";

const BoolChip = ({ active, label }) => (
  <span
    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
      active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
    }`}
  >
    {active ? <IoIosCheckmarkCircleOutline /> : <MdOutlineCancel />}
    {label}
  </span>
);

const ContactField = ({ icon: Icon, label, value }) => (
  <div className="flex min-w-0 items-start gap-3">
    <Icon className="mt-1 shrink-0 text-xl text-red-500" />
    <div className="flex min-w-0 flex-col">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="min-w-0 font-medium">{value ? <LongText>{value}</LongText> : "—"}</span>
    </div>
  </div>
);

const DatosRapidos = ({ r }) => (
  <div>
    <p className={sectionLabelClass}>Datos rápidos</p>

    <div className="flex flex-col gap-5 rounded-lg border border-surface-200 bg-white p-4 text-sm">
      <ContactField icon={MdOutlineEmail} label="Email" value={r.email} />
      <ContactField icon={MdOutlineLocalPhone} label="Teléfono" value={r.telalumno} />

      <div className="flex items-start gap-3">
        <MdOutlineDirectionsCar className="mt-1 flex-shrink-0 text-xl text-red-500" />
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted">Movilidad</span>
          <div className="flex flex-wrap gap-2">
            <BoolChip active={r.carnetDeConducir} label="Carnet" />
            <BoolChip active={r.tieneCoche} label="Vehículo" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default DatosRapidos;
