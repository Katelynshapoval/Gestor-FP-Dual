import { useNavigate } from 'react-router-dom';
import '../styles.css'; // Importa el archivo de estilos CSS global
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useUser } from '../globales/User';

const Login = () => {
    const history = useNavigate();
    const { setUser } = useUser(); // Nos hará falta para establecer el usuario.

    // Función para enviar el email al backend tras el login exitoso
    const handleOAuthSuccess = async (credentialResponse) => {
        try {
            // Decodifica el token JWT para obtener el email (puedes usar jwt-decode)
            const decodedToken = JSON.parse(atob(credentialResponse.credential.split('.')[1]));
            const userEmail = decodedToken.email;

            // Envía el email al backend
            const response = await fetch("/getUserByEmail", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail }),
            });

            if (response.ok) {
                const userData = await response.json();
                console.log(response);
                setUser({ 
                    nombre: userData.name,
                    email: userEmail,
                    specialities: userData.specialities
                });
                history("/");
            } else {
                throw new Error('Usuario no autorizado');
            }
        } catch (error) {
            console.error('Error en OAuth:', error);
            document.getElementById("error").style.visibility = "visible";
        }
    };

    const handleOAuthError = () => {
        console.error('Error en el login con Google');
        document.getElementById("error").style.visibility = "visible";
    };

    return (
        <div className="backgroundlogin"> {/* Aplica la clase backgroundlogin */}
            <div className="content"> {/* Aplica la clase content */}
                <div className="form-container"> {/* Aplica la clase form-container */}
                    <div className="login-form">
                        <h2>GESTOR DE FP</h2>
                        <GoogleOAuthProvider clientId="791547102279-74v5rl4flrgun24og9roreds7t6euqbc.apps.googleusercontent.com">
                            <GoogleLogin onSuccess={handleOAuthSuccess} onError={handleOAuthError} useOneTap/>
                        </GoogleOAuthProvider>
                        <div id="error" style={{ visibility: "hidden" }}>
                            <p>Error al iniciar sesión. Inténtalo de nuevo.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;