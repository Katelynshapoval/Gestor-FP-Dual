// Configuración: one header, a tab per section, each tab its own address.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Configuracion from "./Configuracion.jsx";

const Ruta = () => <p data-testid="ruta">{useLocation().pathname}</p>;

function abrir(ruta) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/configuracion" element={<Configuracion />}>
          <Route path="convocatorias" element={<p>Contenido convocatorias</p>} />
          <Route path="personal" element={<p>Contenido personal</p>} />
          <Route path="correos" element={<p>Contenido correos</p>} />
          <Route path="*" element={null} />
        </Route>
      </Routes>
      <Ruta />
    </MemoryRouter>,
  );
}

test("the tab of the address is selected and its content shown", () => {
  abrir("/configuracion/personal");
  expect(screen.getByRole("heading", { level: 1, name: "Configuración" })).toBeInTheDocument();
  const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
  expect(tabs).toEqual(["Convocatorias", "Personal", "Correos"]);
  expect(screen.getByRole("tab", { name: "Personal" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Contenido personal");
});

test("choosing a tab changes the address; arrow keys move between tabs", () => {
  abrir("/configuracion/convocatorias");
  fireEvent.click(screen.getByRole("tab", { name: "Correos" }));
  expect(screen.getByTestId("ruta")).toHaveTextContent("/configuracion/correos");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Contenido correos");
  fireEvent.keyDown(screen.getByRole("tab", { name: "Correos" }), { key: "ArrowRight" });
  expect(screen.getByTestId("ruta")).toHaveTextContent("/configuracion/convocatorias");
});

test("without a tab, or with an unknown one, it opens Convocatorias", () => {
  abrir("/configuracion/nada");
  expect(screen.getByTestId("ruta")).toHaveTextContent("/configuracion/convocatorias");
  expect(screen.getByRole("tab", { name: "Convocatorias" })).toHaveAttribute("aria-selected", "true");
});
