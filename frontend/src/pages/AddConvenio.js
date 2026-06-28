import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { MdOutlineFileUpload } from "react-icons/md";
import { FaFileCircleCheck } from "react-icons/fa6";

function AddConvenio() {
  const { id } = useParams();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleUpload = async () => {
    if (!file) {
      setError("Por favor, selecciona un archivo PDF.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Solo se aceptan archivos PDF.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("convenio", file);

      const res = await fetch(`/convenio-publico/${id}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Error al subir el convenio.");
      }

      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface-50 px-4 py-10">
        <div className="w-full max-w-md rounded-xl2 border border-green-200 bg-green-50 p-8 text-center shadow-card">
          <FaFileCircleCheck className="mx-auto mb-4 h-9 w-9 text-green-700" />
          <h2 className="mb-2 text-xl font-semibold text-green-800">
            Convenio subido correctamente
          </h2>
          <p className="text-sm text-green-700">
            Hemos recibido el convenio firmado. Nuestro equipo lo revisará y
            contactará contigo si fuera necesario.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-surface-50 px-4 py-10">
      <div className="w-full max-w-md rounded-xl2 border border-border bg-white p-6 shadow-card">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-700">
            <MdOutlineFileUpload className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-semibold text-charcoal-950">Subir convenio</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Por favor, adjunta el convenio que recibiste por correo debidamente
            firmado.
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted">
            Convenio firmado (PDF)
          </label>

          <label className="file-upload">
            <MdOutlineFileUpload className="file-upload-icon" />
            <span className="file-upload-text">
              {file ? file.name : "Seleccionar archivo..."}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const selected = e.target.files[0];
                if (selected && selected.type !== "application/pdf") {
                  setError("Solo se aceptan archivos PDF.");
                  setFile(null);
                  return;
                }
                setFile(selected || null);
                setError(null);
              }}
              required
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className={`btn btn-primary w-full mt-6 justify-center ${
            !file || uploading ? "btn-disabled" : ""
          }`}
        >
          {uploading ? "Subiendo..." : "Subir convenio"}
        </button>
      </div>
    </div>
  );
}

export default AddConvenio;
