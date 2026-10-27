import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { readStoredSession, SESSION_EXPIRED_EVENT, tokenExpiry } from "../utils/api.js";

const UserContext = createContext();

// Used only when a token carries no readable `exp` (should not happen).
const FALLBACK_DURATION = 8 * 60 * 60 * 1000;

const NOTICE = {
  ACCOUNT_DISABLED: "Tu cuenta está desactivada. Contacta con el centro.",
  SESSION_STALE: "Tus permisos han cambiado. Inicia sesión de nuevo.",
  EXPIRED: "Tu sesión ha caducado. Inicia sesión de nuevo.",
};

export const User = ({ children }) => {
  // Restore session on app load
  const [user, setUserState] = useState(() => {
    const saved = readStoredSession();
    if (!saved) {
      localStorage.removeItem("user");
      return null;
    }
    return saved.data;
  });
  // Why the session ended, shown once on the login page.
  const [sessionNotice, setSessionNotice] = useState(null);
  const endedRef = useRef(false);

  // Save immediately to avoid auth race conditions after login. The expiry
  // is the token's own `exp` (WF-16), so renewing the stored user (e.g. after
  // changing the password) never extends a session the server will refuse.
  const setUser = useCallback((newUser) => {
    if (newUser) {
      const expires = tokenExpiry(newUser.token) || Date.now() + FALLBACK_DURATION;
      localStorage.setItem("user", JSON.stringify({ data: newUser, expires }));
      endedRef.current = false;
      setSessionNotice(null);
    } else {
      localStorage.removeItem("user");
    }
    setUserState(newUser);
  }, []);

  const endSession = useCallback((code) => {
    if (endedRef.current) return;
    endedRef.current = true;
    localStorage.removeItem("user");
    setUserState(null);
    setSessionNotice(NOTICE[code] || NOTICE.EXPIRED);
  }, []);

  // A 401 from any API call (see utils/api.js) ends the session once.
  useEffect(() => {
    const onExpired = (event) => {
      if (!readStoredSession() && !user) return;
      endSession(event.detail?.code);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [endSession, user]);

  // The session also ends on its own at the token's expiry, even when idle.
  useEffect(() => {
    if (!user?.token) return undefined;
    const expires = readStoredSession()?.expires;
    if (!expires) return undefined;
    const ms = expires - Date.now();
    if (ms <= 0) {
      endSession("EXPIRED");
      return undefined;
    }
    // setTimeout overflows above ~24.8 days; tokens last hours.
    const timer = setTimeout(() => endSession("EXPIRED"), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [user, endSession]);

  // Sync login/logout across browser tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== "user") return;
      const saved = readStoredSession();
      setUserState(saved ? saved.data : null);
    };

    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const logout = (navigate) => {
    setUser(null);
    setSessionNotice(null);

    if (navigate) {
      navigate("/login");
    }
  };

  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);

  return (
    <UserContext.Provider value={{ user, setUser, logout, sessionNotice, clearSessionNotice }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
