import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { User } from "./context/UserContext";
import PageLayout from "./components/layout/PageLayout.jsx";
import { ToastProvider } from "./components/feedback/ToastProvider.jsx";

import Home from "./pages/Home/Home.js";
import Login from "./pages/Login";
import AddDualStudent from "./pages/AddDualStudent";
import AddCompanyRequest from "./pages/AddCompanyRequest";
import LinkStudents from "./pages/LinkStudents";
import CompanyView from "./pages/CompanyView/";
import AdminCompanyView from "./pages/AdminCompanyView/AdminCompanyView.jsx";
import Convocatorias from "./pages/Convocatorias/Convocatorias.jsx";
import Personal from "./pages/Personal/Personal.jsx";
import StudentMain from "./pages/StudentMain";
import AdminDocumentsView from "./pages/AdminDocumentsView";
import Panel from "./pages/Panel/Panel.jsx";
import Reservas from "./pages/Reservas/Reservas.jsx";
import RequireRole from "./components/auth/RequireRole.jsx";
import CambiarPassword from "./pages/CambiarPassword.jsx";
import { RecuperarPassword, RestablecerPassword } from "./pages/RecuperarPassword.jsx";
import { STAFF } from "./navigation.js";

import "./styles/main.css";
import "./styles/forms.css";

// Old paths keep working (bookmarks, links in emails); the query string is kept.
const Legacy = ({ to }) => {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
};

const guard = (roles, element) => <RequireRole roles={roles}>{element}</RequireRole>;

function App() {
  return (
    <User>
      <ToastProvider>
        <div className="app">
          <BrowserRouter>
            <Routes>
              <Route element={<PageLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/recuperar-contrasena" element={<RecuperarPassword />} />
                <Route path="/restablecer-contrasena" element={<RestablecerPassword />} />
                <Route path="/addDualStudent" element={<AddDualStudent />} />
                <Route path="/addCompanyRequest" element={<AddCompanyRequest />} />

                <Route path="/panel" element={guard(STAFF, <Panel />)} />
                <Route path="/alumnos" element={guard([...STAFF, "EMPRESA"], <LinkStudents />)} />
                <Route path="/empresas" element={guard(STAFF, <AdminCompanyView />)} />
                <Route path="/reservas" element={guard(STAFF, <Reservas />)} />
                <Route path="/documentos" element={guard(STAFF, <AdminDocumentsView />)} />
                <Route path="/convocatorias" element={guard(STAFF, <Convocatorias />)} />
                <Route path="/personal" element={guard(["ADMINISTRADOR"], <Personal />)} />

                <Route path="/companyMain" element={guard(["EMPRESA"], <CompanyView />)} />
                <Route path="/studentMain" element={guard(["ALUMNO"], <StudentMain />)} />
                <Route path="/cambiarPassword" element={guard(undefined, <CambiarPassword />)} />

                <Route path="/linkStudents" element={<Legacy to="/alumnos" />} />
                <Route path="/companiesView" element={<Legacy to="/empresas" />} />
                <Route path="/documentsView" element={<Legacy to="/documentos" />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </div>
      </ToastProvider>
    </User>
  );
}

export default App;
