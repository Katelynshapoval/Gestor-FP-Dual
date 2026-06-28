import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { MdOutlineFileUpload } from "react-icons/md";

// Public convenio upload page — accessed via the tokenised link sent to the company by email
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
      <div className="flex items-center justify-center px-4 bg-gray-50 p-10">
        <div className="w-full max-w-md rounded-xl border border-green-200 bg-green-50 p-8 shadow-sm text-center">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-xl font-semibold text-green-800 mb-2">
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
    <div className="flex items-center justify-center px-4 bg-gray-50 p-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-sm">
        {/* Page header */}
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">📄</div>
          <h2 className="text-xl font-semibold">Subir convenio</h2>
          <p className="mt-1 text-sm text-muted">
            Por favor, adjunta el convenio que recibiste por correo debidamente
            firmado.
          </p>
        </div>

        {/* File selector */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-muted">
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
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Submit button */}
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
