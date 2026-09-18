import { Navigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";

function homeForRole(rol) {
  if (rol === "ALUMNO") return "/studentMain";
  if (rol === "EMPRESA") return "/companyMain";
  return "/";
}

// Hiding a menu item is not security: unmatched roles are redirected.
function RequireRole({ roles, children }) {
  const { user } = useUser();

  if (!user) return <Navigate to="/login" replace />;
  if (roles?.length && !roles.includes(user.rol)) {
    return <Navigate to={homeForRole(user.rol)} replace />;
  }
  return children;
}

export default RequireRole;
