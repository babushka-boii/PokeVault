import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { Button, ButtonLink } from "./Button";
import { Chip } from "./Chip";
import { CutPanel } from "./CutPanel";
import { InlineError } from "./InlineError";
import { PixelLabel } from "./PixelLabel";
import { LoadingStatus, Skeleton } from "./Skeleton";

test("button links are real links and primary ones get the cut corner", () => {
  render(<MemoryRouter><ButtonLink to="/scanner">Escanear carta</ButtonLink><ButtonLink to="/sets" variant="secondary">Buscar</ButtonLink></MemoryRouter>);
  const primary = screen.getByRole("link", { name: "Escanear carta" });
  expect(primary).toHaveAttribute("href", "/scanner");
  expect(primary).toHaveClass("pv-button--primary", "pv-cut");
  expect(screen.getByRole("link", { name: "Buscar" })).not.toHaveClass("pv-cut");
});

test("buttons default to type button and forward clicks", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Reintentar</Button>);
  const button = screen.getByRole("button", { name: "Reintentar" });
  expect(button).toHaveAttribute("type", "button");
  await userEvent.click(button);
  expect(onClick).toHaveBeenCalledOnce();
});

test("inline errors are announced and retry only through their handler", async () => {
  const retry = vi.fn();
  render(<InlineError message="No se pudo cargar." retryLabel="Reintentar" onRetry={retry} />);
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar.");
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledOnce();
});

test("loading regions are busy, announce a status and hide their skeletons", () => {
  render(<LoadingStatus label="Cargando valor…"><Skeleton shape="number" /><Skeleton shape="text" lines={2} /></LoadingStatus>);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Cargando valor…");
  const region = status.parentElement!;
  expect(region).toHaveAttribute("aria-busy", "true");
  const skeletons = region.querySelectorAll(".pv-skeleton");
  expect(skeletons).toHaveLength(3);
  skeletons.forEach((skeleton) => expect(skeleton).toHaveAttribute("aria-hidden", "true"));
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

test("pixel labels are text, chips link only when given a destination", () => {
  render(<MemoryRouter><PixelLabel tone="gold">Valor de tu colección</PixelLabel><Chip>12 copias</Chip><Chip to="/collection?variant=unknown">2 sin variante · indicar</Chip></MemoryRouter>);
  expect(screen.getByText("Valor de tu colección")).toHaveClass("pv-pixel");
  expect(screen.getByText("12 copias").closest("a")).toBeNull();
  expect(screen.getByRole("link", { name: "2 sin variante · indicar" })).toHaveAttribute("href", "/collection?variant=unknown");
});

test("cut panels render the requested landmark with its label", () => {
  render(<CutPanel tone="scan" aria-labelledby="scan-title"><h2 id="scan-title">Escáner</h2></CutPanel>);
  const region = screen.getByRole("region", { name: "Escáner" });
  expect(region).toHaveClass("pv-cut", "pv-panel--scan");
});
