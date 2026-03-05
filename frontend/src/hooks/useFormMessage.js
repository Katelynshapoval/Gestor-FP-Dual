import { useState } from 'react';

// HOOK para mostrar mensajes temporales en formularios.
// Recibe la duración en ms (por defecto 5 segundos) y devuelve
// el mensaje actual junto con una función para mostrarlo.
export function useFormMessage(duration = 5000) {
  const [message, setMessage] = useState('');

  const showMessage = async (text) => {
    setMessage(text);
    await new Promise((resolve) => setTimeout(resolve, duration));
    setMessage('');
  };

  return { message, showMessage };
}
