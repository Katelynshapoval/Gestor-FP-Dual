// Phase 4 · navigation per role, search, accessible tabs, step forms and the
// portals' pending-action rules. Mocked (Jest + Testing Library), no backend.
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { coincide, normalizar } from "./utils/busqueda.js";
import { homeForRole, isActivePath, navForUser, pageTitle } from "./navigation.js";
import Tabs from "./components/ui/Tabs.jsx";
import { ErrorSummary, TextField, useStepForm } from "./components/forms/StepForm.jsx";
import { pendientesAlumno } from "./pages/StudentMain/index.js";
import { pendientesEmpresa } from "./pages/CompanyView/index.js";
import { tipoContratoLabel } from "./utils/labels.js";

describe("navigation (D.1)", () => {
  test("staff get management areas, never the public forms", () => {
    const staff = navForUser({ rol: "COORDINADOR" }).map((i) => i.to);
    expect(staff).toEqual(["/panel", "/alumnos", "/empresas", "/reservas", "/documentos", "/convocatorias"]);
    expect(staff).not.toContain("/personal");
    expect(staff).not.toContain("/addDualStudent");
    const admin = navForUser({ rol: "ADMINISTRADOR" }).map((i) => i.to);
    expect(admin).toEqual([...staff, "/personal"]);
    expect(pageTitle("/personal")).toBe("Personal");
  });
  test("visitors, companies and students get their own menus and homes", () => {
    expect(navForUser(null).map((i) => i.to)).toContain("/addCompanyRequest");
    expect(navForUser({ rol: "EMPRESA" }).map((i) => i.label)).toEqual(["Mi empresa", "Alumnos disponibles"]);
    expect(navForUser({ rol: "ALUMNO" }).map((i) => i.to)).toEqual(["/studentMain"]);
    expect(homeForRole("ADMINISTRADOR")).toBe("/panel");
    expect(homeForRole("EMPRESA")).toBe("/companyMain");
  });
  test("active entry matches sub-paths but Inicio only matches itself", () => {
    expect(isActivePath("/alumnos", { to: "/alumnos" })).toBe(true);
    expect(isActivePath("/alumnos/3", { to: "/alumnos" })).toBe(true);
    expect(isActivePath("/panel", { to: "/", end: true })).toBe(false);
    expect(pageTitle("/alumnos", { rol: "EMPRESA" })).toBe("Alumnos disponibles");
  });
});

describe("search", () => {
  test("ignores accents and case; every word must match some field", () => {
    expect(normalizar("  García ")).toBe("garcia");
    expect(coincide("garcia ana", ["Ana García López", "12345678Z"])).toBe(true);
    expect(coincide("12345678z", ["Ana", "12345678Z"])).toBe(true);
    expect(coincide("ana pérez", ["Ana García"])).toBe(false);
    expect(coincide("", ["x"])).toBe(true);
  });
  test("contract types are shown with readable labels", () => {
    expect(tipoContratoLabel("CONTRATO_DE_FORMACION_EN_ALTERNANCIA")).toBe("Contrato de formación en alternancia");
    expect(tipoContratoLabel("Beca")).toBe("Beca");
  });
});

describe("Tabs (WAI-ARIA)", () => {
  function Harness() {
    const [value, setValue] = useState("a");
    return (
      <Tabs
        label="Secciones"
        value={value}
        onChange={setValue}
        tabs={[
          { id: "a", label: "Uno" },
          { id: "b", label: "Dos", badge: 2, badgeLabel: "pendientes" },
          { id: "c", label: "Tres" },
        ]}
      >
        <p>Panel {value}</p>
      </Tabs>
    );
  }
  test("one tab stop, arrow keys move and select, panel labelled by its tab", () => {
    render(<Harness />);
    const uno = screen.getByRole("tab", { name: "Uno" });
    expect(uno).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /Dos/ })).toHaveAttribute("tabindex", "-1");
    uno.focus();
    fireEvent.keyDown(uno, { key: "ArrowRight" });
    const dos = screen.getByRole("tab", { name: /Dos 2 pendientes/ });
    expect(dos).toHaveAttribute("aria-selected", "true");
    expect(dos).toHaveFocus();
    fireEvent.keyDown(dos, { key: "End" });
    expect(screen.getByRole("tab", { name: "Tres" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Tres" }), { key: "ArrowRight" });
    expect(uno).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Uno" })).toHaveTextContent("Panel a");
  });
});

describe("step forms", () => {
  const STEPS = [
    { id: "uno", title: "Uno" },
    { id: "dos", title: "Dos" },
  ];
  function Harness() {
    const form = useStepForm({
      steps: STEPS,
      initialValues: { nombre: "", email: "" },
      validateStep: (id, v) => (id === "uno" ? { nombre: v.nombre ? null : "Obligatorio." } : {}),
    });
    return (
      <form>
        <p>Paso {form.step + 1}</p>
        <ErrorSummary errors={form.errors} labels={{ nombre: "Nombre" }} />
        {form.step === 0 && (
          <TextField name="nombre" label="Nombre" required value={form.values.nombre} onChange={form.set} error={form.errors.nombre} />
        )}
        <button type="button" onClick={form.next}>
          Siguiente
        </button>
        <button type="button" onClick={form.back}>
          Anterior
        </button>
      </form>
    );
  }
  test("errors block the step, are listed and linked to the field; values survive going back", () => {
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb();
      return 0;
    });
    window.scrollTo = jest.fn();
    render(<Harness />);
    fireEvent.click(screen.getByText("Siguiente"));
    expect(screen.getByText("Paso 1")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Nombre: Obligatorio.");
    const input = screen.getByLabelText(/Nombre/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Obligatorio/);
    fireEvent.change(input, { target: { value: "Ana" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Siguiente"));
    expect(screen.getByText("Paso 2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Anterior"));
    expect(screen.getByLabelText(/Nombre/)).toHaveValue("Ana");
  });
});

describe("portal pending actions (D.3)", () => {
  const noop = () => {};
  test("student: rejected document, signature due and waiting state", () => {
    const items = pendientesAlumno({
      solicitud: { estado_validacion: "VALIDADO" },
      documentos: [{ clave: "CV", nombre: "CV", estado_operativo: "RECHAZADO", motivo: "Ilegible", accion_pendiente_de: ["ALUMNO"] }],
      reservas: [
        {
          id_reserva: 4,
          empresa: "ACME",
          estado_reserva: "PENDIENTE",
          documentos_resumen: { anexo: { clave: "ANEXO_II", firmas_pendientes: ["ALUMNO", "CENTRO"] } },
        },
      ],
      irA: noop,
      abrirReserva: noop,
    });
    expect(items.map((i) => i.tone)).toEqual(["action", "action", "waiting"]);
    expect(items[0].title).toMatch(/CV: rechazado/);
    expect(items[0].text).toBe("Motivo: Ilegible");
    expect(items[1].title).toBe("Firma el Anexo II de ACME.");
  });
  test("student: a confirmed placement is shown as done; cancelled ones are ignored", () => {
    const items = pendientesAlumno({
      solicitud: { estado_validacion: "VALIDADO" },
      documentos: [],
      reservas: [
        { id_reserva: 1, empresa: "Vieja", estado_reserva: "CANCELADA" },
        { id_reserva: 2, empresa: "ACME", estado_reserva: "CONFIRMADA", documentos_resumen: {} },
      ],
      irA: noop,
      abrirReserva: noop,
    });
    expect(items).toEqual([expect.objectContaining({ tone: "done", title: "Tu plaza en ACME está confirmada." })]);
  });
  test("company: annex upload and calendar due per reservation, re-application, pending change", () => {
    const items = pendientesEmpresa({
      solicitud: { estado_validacion: "VALIDADO", convocatoria_activa: 1, puede_reaplicar: false },
      cambio: { pending: { id: 1 } },
      reservations: [
        {
          id_reserva: 7,
          alumno: "Ana",
          estado_reserva: "PENDIENTE",
          documentos_resumen: {
            anexo: { clave: "ANEXO_II", estado_operativo: "PENDIENTE_SUBIDA", firmas_pendientes: [] },
            calendario: { clave: "CALENDARIO", estado_operativo: "PENDIENTE_SUBIDA", firmas_pendientes: [] },
          },
        },
      ],
      documentos: [{ clave: "ANEXO_XIV", nombre: "Anexo XIV", estado_operativo: "PENDIENTE_SUBIDA", accion_pendiente_de: ["EMPRESA"] }],
      irA: noop,
      abrirReserva: noop,
      irAlumnos: noop,
    });
    const titles = items.map((i) => i.title);
    expect(titles).toContain("Reserva de Ana: subir el Anexo II y subir el Calendario.");
    expect(titles).toContain("Anexo XIV: pendiente de subir.");
    expect(titles).toContain("Vuestros cambios de datos están pendientes de aprobación por el centro.");
  });
});
