// Wording shared by the document-types page and its dialog.

export const AMBITOS = {
  solicitud_alumno: {
    titulo: "Solicitud del alumno",
    cada: "Uno por cada solicitud de alumno.",
  },
  solicitud_empresa: {
    titulo: "Solicitud de empresa",
    cada: "Uno por cada solicitud de empresa y convocatoria.",
  },
  reserva: {
    titulo: "Reserva",
    cada: "Uno por cada alumno reservado en una empresa.",
  },
};

export const FIRMANTES = [
  { campo: "firma_empresa", rol: "EMPRESA", label: "Empresa" },
  { campo: "firma_centro", rol: "CENTRO", label: "Centro" },
  { campo: "firma_alumno", rol: "ALUMNO", label: "Alumno" },
];

// The student never signs company documents; the company never signs the
// student's application documents (the server refuses it too).
export function firmaPermitida(ambito, rol) {
  if (!ambito) return false;
  if (rol === "ALUMNO") return ambito !== "solicitud_empresa";
  if (rol === "EMPRESA") return ambito !== "solicitud_alumno";
  return true;
}

export const REQUERIDO_TEXTO = {
  solicitud_alumno: "Hay que validarlo para poder validar al alumno.",
  solicitud_empresa: "Hay que validarlo para poder validar a la empresa.",
  reserva: "Tiene que estar firmado y validado para confirmar la reserva.",
};

export function firmantesTexto(tipo) {
  const quienes = FIRMANTES.filter((f) => tipo[f.campo]).map((f) => f.label.toLowerCase());
  if (!quienes.length) return "Sin firmas";
  if (quienes.length === 1) return `Firma ${quienes[0]}`;
  const ultima = quienes.pop();
  return `Firman ${quienes.join(", ")} y ${ultima}`;
}
