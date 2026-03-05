import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useUser } from '../globales/User';

// PÁGINA de inicio de sesión mediante OAuth de Google.
const Login = () => {
  const navigate = useNavigate();
  const { setUser } = useUser();

  const handleOAuthSuccess = async (credentialResponse) => {
    try {
      const decoded = JSON.parse(atob(credentialResponse.credential.split('.')[1]));
      const response = await fetch('/getUserByEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: decoded.email }),
      });
      if (!response.ok) throw new Error('Usuario no autorizado');
      const userData = await response.json();
      setUser({ nombre: userData.name, email: decoded.email, specialities: userData.specialities });
      navigate('/');
    } catch {
      document.getElementById('login-error').style.display = 'block';
    }
  };

  const handleOAuthError = () => {
    document.getElementById('login-error').style.display = 'block';
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo-mark">
          {/* Escudo simplificado */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:28,height:28,color:'#fff'}}>
            <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
          </svg>
        </div>
        <h2>Bienvenido</h2>
        <p className="subtitle">Accede con tu cuenta institucional de Google</p>
        <div className="login-divider" />
        <GoogleOAuthProvider clientId="791547102279-74v5rl4flrgun24og9roreds7t6euqbc.apps.googleusercontent.com">
          <GoogleLogin onSuccess={handleOAuthSuccess} onError={handleOAuthError} useOneTap />
        </GoogleOAuthProvider>
        <div id="login-error" className="login-error" style={{ display: 'none' }}>
          Error al iniciar sesión. Inténtalo de nuevo.
        </div>
      </div>
    </div>
  );
};

export default Login;
