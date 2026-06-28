import { createContext, useContext, useState, useEffect } from 'react';

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

    useEffect(() => {
        if (user) {
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
