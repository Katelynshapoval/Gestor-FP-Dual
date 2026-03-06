const ESTADO_LABELS = {
  0: "Sin asignar",
  1: "Asignado",
  2: "Información enviada",
  3: "Rechazado",
  4: "Pendiente",
  5: "Finalizado / Aceptado",
};

const estadoColor = (label) => {
  if (label === "Finalizado / Aceptado") return "bg-green-100 text-green-800";
  if (label === "Rechazado") return "bg-red-100 text-red-800";
  if (label === "Información enviada") return "bg-blue-100 text-blue-800";
  return "bg-yellow-100 text-yellow-800";
};

// Determinar el estado de esta empresa para un alumno concreto.
const getEstado = (student, userName) => {
  const slots = [
    { em: student.em1, estado: student.estid1 },
    { em: student.em2, estado: student.estid2 },
    { em: student.em3, estado: student.estid3 },
  ];
  const match = slots.find((s) => s.em === userName);
  return match ? (ESTADO_LABELS[match.estado] ?? "Desconocido") : "—";
};

// Lista de alumnos asignados a la empresa.
const AssignedStudents = ({ students, userName }) => {
  if (students.length === 0) {
    return (
      <p className="text-gray-500 text-sm">Aún no tienes alumnos asignados.</p>
    );
  }

  return (
    <div className="space-y-3">
      {students.map((student) => {
        const estado = getEstado(student, userName);
        return (
          <div
            key={student.idGestion}
            className="bg-gray-50 rounded-lg border px-4 py-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">
                  {student.nombre}
                  <span className="font-normal text-[.8rem] text-gray-400">
                    ({student.dni})
                  </span>
                </p>
                {student.nombreEsp && (
                  <p className="text-xs text-gray-500">{student.nombreEsp}</p>
                )}
              </div>
              <span
                className={`inline-block px-2.5 py-1 rounded-full text-[0.72rem] font-semibold tracking-wide ${estadoColor(estado)}`}
              >
                {estado}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AssignedStudents;
