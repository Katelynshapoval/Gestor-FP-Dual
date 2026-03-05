import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { User } from "./globales/User";
import PageLayout from "./components/layout/PageLayout.jsx";

import Home from "./pages/Home/Home.js";
import Login from "./pages/Login";
import AddDualStudent from "./pages/AddDualStudent";
import AddCompanyRequest from "./pages/AddCompanyRequest";
import AddConvenio from "./pages/AddConvenio";
import Evaluation from "./components/Evaluation";
import LinkStudents from "./pages/LinkStudents";
import CompanyView from "./pages/CompanyView";

import "./shared_styles/main.css";

// Envuelve una página en el layout general (Header + Footer)
const Page = ({ children }) => <PageLayout>{children}</PageLayout>;

// COMPONENTE RAÍZ con el enrutador y el proveedor de usuario global
function App() {
  return (
    <User>
      <div className="app">
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <Page>
                  <Login />
                </Page>
              }
            />
            <Route
              path="/"
              element={
                <Page>
                  <Home />
                </Page>
              }
            />
            <Route
              path="/addDualStudent"
              element={
                <Page>
                  <AddDualStudent />
                </Page>
              }
            />
            <Route
              path="/addCompanyRequest"
              element={
                <Page>
                  <AddCompanyRequest />
                </Page>
              }
            />
            <Route
              path="/addConvenio/:id"
              element={
                <Page>
                  <AddConvenio />
                </Page>
              }
            />
            <Route
              path="/evaluate/:id"
              element={
                <Page>
                  <Evaluation />
                </Page>
              }
            />
            <Route
              path="/linkStudents"
              element={
                <Page>
                  <LinkStudents />
                </Page>
              }
            />
            <Route
              path="/companyMain"
              element={
                <Page>
                  <CompanyView />
                </Page>
              }
            />
          </Routes>
        </BrowserRouter>
      </div>
    </User>
  );
}

export default App;
