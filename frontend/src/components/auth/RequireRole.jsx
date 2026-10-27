import { Navigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { homeForRole } from "../../navigation.js";

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
