import { useState } from "react";
import Modal from "../ui/Modal.jsx";
import FirmaCaptura from "./FirmaCaptura.jsx";
import { guardarFirma } from "../../utils/firma.js";
import { useToast } from "../feedback/ToastProvider.jsx";

// Creates or changes a saved signature: the person's own ("USUARIO") or, for
// an under-18 student, the legal guardian's ("TUTOR"). onSaved gets the new
// state of /firmas/mia.
export default function FirmaDialog({ open, onClose, onSaved, titular = "USUARIO", cambiar = false, tutorNombre }) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const deTutor = titular === "TUTOR";

  const guardar = async ({ blob, origen }) => {
    setOcupado(true);
    setError("");
    try {
      const estado = await guardarFirma({ blob, origen, titular });
      toast.success(deTutor ? "Firma del tutor legal guardada." : "Firma guardada.");
      onSaved?.(estado);
      onClose?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar la firma.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      busy={ocupado}
      title={deTutor ? "Firma del tutor o tutora legal" : cambiar ? "Cambiar mi firma" : "Crea tu firma"}
      description={
        deTutor
          ? `Tiene que hacerla ${tutorNombre || "tu tutor o tutora legal"} en persona. Se añade a los documentos que firmes mientras seas menor de edad.`
          : cambiar
            ? "Los documentos que ya has firmado conservan la firma anterior."
            : "Solo se pide una vez. Después firmas tus documentos con un clic."
      }
    >
      {open && <FirmaCaptura onListo={guardar} ocupado={ocupado} error={error} />}
    </Modal>
  );
}
