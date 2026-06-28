import { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

// Persists user session to localStorage with an 8-hour expiry.
// Syncs logout across browser tabs via the storage event.
export const User = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    const { data, expires } = JSON.parse(saved);
    if (expires > Date.now()) return data;
    localStorage.removeItem('user');
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify({
        data: user,
        expires: Date.now() + 8 * 60 * 60 * 1000,
      }));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  // Keeps other tabs in sync when the session changes
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'user') return;
      if (!e.newValue) {
        setUser(null);
        return;
      }
      const { data, expires } = JSON.parse(e.newValue);
      if (expires > Date.now()) {
        setUser(data);
      } else {
        localStorage.removeItem('user');
        setUser(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const logout = (navigate) => {
    setUser(null);
    if (navigate) navigate('/login');
  };

  return (
    <UserContext.Provider value={{ user, setUser, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
