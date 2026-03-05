import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { verificarId } from '../utils/idObfuscation.js';

// PÁGINA para que las empresas suban el convenio firmado.
function AddConvenio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (!verificarId(id)) navigate('/');
  }, [id, navigate]);

  const handleUpload = () => {
    if (!file) { alert('Por favor, selecciona un archivo PDF.'); return; }
    const blob = new FormData();
    blob.append('convenio', file);
    fetch(`/updateConvenio/${id}`, { method: 'POST', body: blob })
      .then((r) => { if (!r.ok) throw new Error('Error al subir el archivo'); return r.json(); })
      .catch((err) => { console.error(err); alert('Error al subir el archivo'); });
  };

  return (
    <div className="convenio-page">
      <div className="convenio-card">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📄</div>
          <h2 className="page-title">Subir Convenio</h2>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Por favor, adjunta el convenio que recibiste por correo debidamente firmado.
          </p>
        </div>
        <div className="file-drop">
          <p style={{ margin: '0 0 .5rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>
            Selecciona un archivo PDF
          </p>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ fontSize: '.83rem' }}
          />
          {file && (
            <p style={{ margin: '.75rem 0 0', fontSize: '.8rem', color: 'var(--brand)', fontWeight: 600 }}>
              ✓ {file.name}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: '1.25rem', width: '100%', justifyContent: 'center' }}
          onClick={handleUpload}
        >
          Subir convenio
        </button>
      </div>
    </div>
  );
}

export default AddConvenio;
