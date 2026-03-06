import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MdOutlineFileUpload } from "react-icons/md";
import { verificarId } from "../utils/idObfuscation.js";

function AddConvenio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (!verificarId(id)) navigate("/");
  }, [id, navigate]);

  const handleUpload = () => {
    if (!file) {
      alert("Por favor, selecciona un archivo PDF.");
      return;
    }

    const blob = new FormData();
    blob.append("convenio", file);

    fetch(`/updateConvenio/${id}`, {
      method: "POST",
      body: blob,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Error al subir el archivo");
        return r.json();
      })
      .then(() => {
        alert("Convenio subido correctamente");
        navigate("/");
      })
      .catch((err) => {
        console.error(err);
        alert("Error al subir el archivo");
      });
  };

  return (
    <div className="flex items-center justify-center px-4 bg-gray-50 p-10">
      <div className="w-full max-w-md bg-white border border-[var(--border)] rounded-xl p-6 shadow-sm">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">📄</div>

          <h2 className="text-xl font-semibold">Subir convenio</h2>

          <p className="text-sm text-[var(--text-muted)] mt-1">
            Por favor, adjunta el convenio que recibiste por correo debidamente
            firmado.
          </p>
        </div>

        {/* Upload */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-[var(--text-muted)]">
            Convenio firmado (PDF)
          </label>

          <label className="file-upload">
            <MdOutlineFileUpload className="file-upload-icon" />

            <span className="file-upload-text">
              {file ? file.name : "Seleccionar archivo..."}
            </span>

            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files[0])}
              required
            />
          </label>
        </div>

        {/* Button */}
        <button
          onClick={handleUpload}
          className="btn btn-primary w-full mt-6 justify-center"
        >
          Subir convenio
        </button>
      </div>
    </div>
  );
}

export default AddConvenio;
