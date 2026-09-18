import { BrowserRouter, Route, Routes } from "react-router-dom";
import { User } from "./context/UserContext";
import PageLayout from "./components/layout/PageLayout.jsx";

import Home from "./pages/Home/Home.js";
import Login from "./pages/Login";
import AddDualStudent from "./pages/AddDualStudent";
import AddCompanyRequest from "./pages/AddCompanyRequest";
import AddConvenio from "./pages/AddConvenio";
import Evaluation from "./components/Evaluation";
import LinkStudents from "./pages/LinkStudents";
import CompanyView from "./pages/CompanyView/";
import AdminCompanyView from "./pages/AdminCompanyView/AdminCompanyView.jsx";
import Convocatorias from "./pages/Convocatorias/Convocatorias.jsx";
import StudentMain from "./pages/StudentMain";
import RequireRole from "./components/auth/RequireRole.jsx";

import "./styles/main.css";

// Wraps a page with the shared Header + Footer layout
const Page = ({ children }) => <PageLayout>{children}</PageLayout>;

function App() {
  return (
    <User>
      <div className="app">
        <BrowserRouter>
          <Routes>
            <Route path="/login"          element={<Page><Login /></Page>} />
            <Route path="/"              element={<Page><Home /></Page>} />
            <Route path="/addDualStudent" element={<Page><AddDualStudent /></Page>} />
            <Route path="/addCompanyRequest" element={<Page><AddCompanyRequest /></Page>} />
            <Route path="/addConvenio/:id" element={<Page><AddConvenio /></Page>} />
            <Route path="/evaluate/:id"  element={<Page><RequireRole roles={["ADMINISTRADOR", "COORDINADOR"]}><Evaluation /></RequireRole></Page>} />
            <Route path="/linkStudents"  element={<Page><RequireRole roles={["ADMINISTRADOR", "COORDINADOR", "EMPRESA"]}><LinkStudents /></RequireRole></Page>} />
            <Route path="/companyMain"   element={<Page><RequireRole roles={["EMPRESA"]}><CompanyView /></RequireRole></Page>} />
            <Route path="/companiesView" element={<Page><RequireRole roles={["ADMINISTRADOR", "COORDINADOR"]}><AdminCompanyView /></RequireRole></Page>} />
            <Route path="/convocatorias" element={<Page><RequireRole roles={["ADMINISTRADOR", "COORDINADOR"]}><Convocatorias /></RequireRole></Page>} />
            <Route path="/studentMain"   element={<Page><RequireRole roles={["ALUMNO"]}><StudentMain /></RequireRole></Page>} />
          </Routes>
        </BrowserRouter>
      </div>
    </User>
  );
}

export default App;
