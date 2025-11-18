import { createContext, useContext, useState, useEffect } from 'react';

// Creamos un contexto (es como un componente padre, que puede guardar valores que usen 
// todos los componentes que se encuentren envueltos en el mismo)
const UserContext = createContext();

export const User = ({ children }) => {
    const [user, setUser] = useState(() => {
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            const { data, expires } = JSON.parse(savedUser);
            if (expires > Date.now()) {
                return data;
            }
            localStorage.removeItem('user');
        }
        return null;
    });

    // Actualizar localStorage cuando user cambie
    useEffect(() => {
        if (user) {
            // Se guarda tambien una fecha (ocho horas en el futuro)
            // en la cual el usuario se eliminará automaticamente para
            // ahorrar almacenamiento.
            const userData = {
                data: user,
                expires: Date.now() + 8 * 60 * 60 * 1000
            };
            localStorage.setItem('user', JSON.stringify(userData));
        } else {
            localStorage.removeItem('user');
        }
    }, [user]);

    // Sincronía entre pestañas
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'user') {
                if (!e.newValue) {
                    setUser(null);
                } else {
                    const { data, expires } = JSON.parse(e.newValue);
                    if (expires > Date.now()) {
                        setUser(data);
                    } else {
                        localStorage.removeItem('user');
                        setUser(null);
                    }
                }
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
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