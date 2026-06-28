import { useState } from 'react';

// Displays a temporary message in forms; clears automatically after the given duration
export function useFormMessage(duration = 5000) {
  const [message, setMessage] = useState('');

  const showMessage = async (text) => {
    setMessage(text);
    await new Promise((resolve) => setTimeout(resolve, duration));
    setMessage('');
  };

  return { message, showMessage };
}
