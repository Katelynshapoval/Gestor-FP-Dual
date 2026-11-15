// Loading states: skeletons wait a moment (no flash on fast loads), screen
// readers hear one sentence, the shapes stay hidden from them.
import { act, render, screen } from "@testing-library/react";
import { InlineLoading, SkeletonCards, SkeletonPortal, SkeletonRows } from "./Loading.jsx";

afterEach(() => vi.useRealTimers());

test("a skeleton announces at once and shows its shapes only after the delay", () => {
  vi.useFakeTimers();
  const { container } = render(<SkeletonCards count={3} label="Cargando empresas…" />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando empresas…");
  expect(container.querySelectorAll('[aria-hidden="true"] .rounded-lg')).toHaveLength(0);
  act(() => vi.advanceTimersByTime(200));
  expect(container.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(3);
});

test("rows and portal skeletons follow the same rules", () => {
  vi.useFakeTimers();
  const rows = render(<SkeletonRows count={2} label="Cargando cuentas…" delay={0} />);
  expect(rows.container.querySelectorAll('ul[aria-hidden="true"] > li')).toHaveLength(2);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando cuentas…");
  rows.unmount();
  render(<SkeletonPortal label="Cargando el portal…" delay={0} />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando el portal…");
});

test("inline loading: a spinner and a sentence, announced", () => {
  render(<InlineLoading>Cargando ofertas…</InlineLoading>);
  const s = screen.getByRole("status");
  expect(s).toHaveTextContent("Cargando ofertas…");
  expect(s.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});
