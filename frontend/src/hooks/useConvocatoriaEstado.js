import { useEffect, useState } from "react";
import { getJSON } from "../utils/api.js";

// Public convocatoria status (GET /convocatorias/estado), fetched once per page
// load: { abierta, activa, proxima }. Used for the "abierto / cerrado" banner
// and to default staff lists to the active convocatoria.
let cache = null;

export function loadConvocatoriaEstado() {
  if (!cache) {
    cache = getJSON("/convocatorias/estado").catch((err) => {
      cache = null;
      throw err;
    });
  }
  return cache;
}

export function useConvocatoriaEstado() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadConvocatoriaEstado()
      .then((data) => !cancelled && setState({ status: "ready", data, error: null }))
      .catch((error) => !cancelled && setState({ status: "error", data: null, error }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
