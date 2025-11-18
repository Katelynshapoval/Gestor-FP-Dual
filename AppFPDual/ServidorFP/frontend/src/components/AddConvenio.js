import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function AddConvenio() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [file, setFile] = useState(null);

    useEffect(() => {
        const numero = id.slice(0, -1)
        const letraControl = id.slice(-1);
        const letras = 'QRBMUHPWACKZFJLVDXSYIGTNOE';
        if (numero % 23 !== 0) {
            navigate('/');
        } else{
            if (letraControl !== letras[(numero / 23) % 26]) {
                navigate('/');
            }
        }
    }, [id, navigate]);

    function ButtonClickUpdate() {
        if (file) {
        UpdateRequest(file);
        } else {
        alert("Por favor, selecciona un archivo PDF.");
        }
    }

    const UpdateRequest = async (file) => {
        const blob = new FormData();
        blob.append('convenio', file);

        const options = {
            method: 'POST',
            body: blob,
        };

        try {
            const response = await fetch("/updateConvenio/" + id, options);
            if (!response.ok) {
                throw new Error('Error al subir el archivo');
            }
            const jsonResponse = await response.json();
            console.log(JSON.stringify(jsonResponse));
        } catch (error) {
            console.error('Error:', error);
            alert('Error al subir el archivo');
        }
    }

    const HandleFileChange = (event) => {
        setFile(event.target.files[0]);
    }

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h1>Por favor inserte el convenio que recibió por correo firmado:</h1>
            <form style={{ marginBottom: '20px' }}>
                <div style={{ marginBottom: '10px' }}>
                    <label htmlFor="file-input" style={{ display: 'block', marginBottom: '5px' }}>Selecciona un archivo PDF:</label>
                    <input type="file" id="file-input" accept=".pdf" onChange={HandleFileChange} style={{ marginBottom: '10px' }}/>
                </div>
                <button type="button" onClick={ButtonClickUpdate} style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Subir PDF</button>
            </form>
        </div>
    );
}

export default AddConvenio;