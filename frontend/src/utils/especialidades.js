export function espId(esp) {
  return Number(esp.id_especialidad ?? esp.idEspecialidad);
}

export function turnoLabel(turnoRaw) {
  if (turnoRaw === 0 || turnoRaw === "0" || turnoRaw === "DIURNO") return null;
  if (turnoRaw === 1 || turnoRaw === "1" || turnoRaw === "VESPERTINO") return "Vespertino";
  return null;
}

export function cicloLabel(esp) {
  const nombre = esp.nombre || esp.nombreEsp || `ID ${espId(esp)}`;
  const codigo = esp.codigo ? ` (${esp.codigo})` : "";
  const turno = turnoLabel(esp.turno);
  return `${nombre}${codigo}${turno ? ` · ${turno}` : ""}`;
}

export function countChanged(raw, saved) {
  const text = String(raw ?? "").trim();
  const savedNumber = Number(saved) || 0;
  if (text === "") return savedNumber !== 0;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return true;
  return parsed !== savedNumber;
}
