import { createContext, useContext, useEffect, useState } from "react";

const UserContext = createContext();

const SESSION_DURATION = 8 * 60 * 60 * 1000;

export const User = ({ children }) => {
  // Restore session on app load
  const [user, setUserState] = useState(() => {
    const saved = localStorage.getItem("user");

    if (!saved) return null;

    try {
      const { data, expires } = JSON.parse(saved);

      if (expires > Date.now()) return data;

      localStorage.removeItem("user");
      return null;
    } catch {
      localStorage.removeItem("user");
      return null;
    }
  });

  // Save immediately to avoid auth race conditions after login
  const setUser = (newUser) => {
    if (newUser) {
      localStorage.setItem(
        "user",
        JSON.stringify({
          data: newUser,
          expires: Date.now() + SESSION_DURATION,
        }),
      );
    } else {
      localStorage.removeItem("user");
    }

    setUserState(newUser);
  };

  // Sync login/logout across browser tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== "user") return;

      if (!e.newValue) {
        setUserState(null);
        return;
      }

      try {
        const { data, expires } = JSON.parse(e.newValue);

        if (expires > Date.now()) {
          setUserState(data);
        } else {
          localStorage.removeItem("user");
          setUserState(null);
        }
      } catch {
        localStorage.removeItem("user");
        setUserState(null);
      }
    };

    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const logout = (navigate) => {
    setUser(null);

    if (navigate) {
      navigate("/login");
    }
  };

  return (
    <UserContext.Provider value={{ user, setUser, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
