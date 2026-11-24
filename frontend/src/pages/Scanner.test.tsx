import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth } from "../auth/context";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { ScannerPage } from "./ScannerPage";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { setPage, setSession, setSummary } from "../test/setFixtures";
import { recognizeResult, scanCapabilities, scannedCopy, scanResult } from "../test/scannerFixtures";
import { jsonResponse as json, pikachuCard } from "../test/tcgFixtures";

type Handler = (url: URL, options?: RequestInit) => Response | Promise<Response> | undefined;
function setup(handler?: Handler, authenticated = true) {
  const request = vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input); const custom = handler?.(url, options); if (custom) return custom;
    if (url.pathname.endsWith("/auth/me")) return authenticated ? json(setSession) : json({}, 401);
    if (url.pathname.endsWith("/scans/capabilities")) return json(scanCapabilities);
    if (url.pathname.endsWith("/scans/recognize")) return json(recognizeResult);
    if (url.pathname.endsWith("/scans/match")) return json(scanResult);
    if (url.pathname === "/api/v1/sets") return json(setPage());
    if (url.pathname === "/api/v1/inventory" && options?.method === "POST") return json({ ...scannedCopy, ...JSON.parse(options.body as string) }, 201);
    if (url.pathname === "/api/v1/inventory") return json({ results: [scannedCopy], total: 3, quantities: { "sm9-33": 3 }, offset: 0, limit: 24 });
    if (url.pathname.startsWith("/api/v1/cards/")) return json(pikachuCard);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", request); return request;
}
const photo = (name = "card.jpg", type = "image/jpeg") => new File(["image bytes"], name, { type });
const originalCreate = URL.createObjectURL; const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  let index = 0;
  URL.createObjectURL = vi.fn(() => `blob:card-${++index}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; });
async function recognize(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo());
  await screen.findByRole("heading", { name: "Cartas candidatas" });
}
async function openManual(user: ReturnType<typeof userEvent.setup>) {
  const disclosure = await screen.findByRole("button", { name: "Identificación manual" });
  if (disclosure.getAttribute("aria-expanded") === "false") await user.click(disclosure);
}
async function select(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Seleccionar esta carta" }));
  await screen.findByText("3 copias propias");
}
const writes = (request: ReturnType<typeof setup>) => request.mock.calls.filter(([input, options]) => new URL(input).pathname === "/api/v1/inventory" && options?.method === "POST");

test("reveals manual correction only when requested and keeps the photograph as the initial action", async () => {
  const request = setup(); const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  const manual = await screen.findByRole("button", { name: "Identificación manual" });
  expect(manual).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("textbox", { name: "Nombre de carta" })).not.toBeInTheDocument();
  expect(screen.queryByRole("searchbox", { name: "Buscar expansión" })).not.toBeInTheDocument();
  await user.click(manual);
  expect(manual).toHaveAttribute("aria-expanded", "true");
  await user.type(screen.getByRole("textbox", { name: "Nombre de carta" }), "Pikachu{Enter}");
  expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toHaveTextContent("sm9-33");
  expect(request.mock.calls.some(([input]) => input.includes("/recognize"))).toBe(false); expect(writes(request)).toHaveLength(0);
});

test.each(["no_match", "insufficient_clues"])("opens correction automatically when a photograph yields %s", async (status) => {
  setup((url) => url.pathname.endsWith("/recognize") ? json({ ...recognizeResult, status, candidates: [] }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user);
  expect(screen.getByRole("button", { name: "Identificación manual" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("textbox", { name: "Nombre de carta" })).toHaveValue("Pikachu & Zekrom-GX");
  expect(screen.getByRole("searchbox", { name: "Buscar expansión" })).toBeVisible();
});

const alternative = (quality = "possible") => ({ ...scanResult.candidates[0], quality, card: { ...scanResult.candidates[0].card, id: "sm9-34", local_id: "34", name: "Alternative printing" } });

test("features the leading verified suggestion and keeps weaker alternatives available on demand", async () => {
  const request = setup((url) => url.pathname.endsWith("/recognize") ? json({ ...recognizeResult, candidates: [scanResult.candidates[0], alternative()] }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user);
  expect(screen.getByText("Sugerencia principal")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Pikachu & Zekrom-GX" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Alternative printing" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Seleccionar esta carta" })).toHaveLength(1);
  await user.click(screen.getByText("Ver otras candidatas (1)"));
  expect(screen.getByRole("heading", { name: "Alternative printing" })).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Seleccionar esta carta" })).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Guardar copia" })).not.toBeInTheDocument(); expect(writes(request)).toHaveLength(0);
});

test.each(["strong", "possible"])("exposes alternatives immediately when the first two candidates both have %s evidence", async (quality) => {
  setup((url) => url.pathname.endsWith("/recognize") ? json({ ...recognizeResult, candidates: [{ ...scanResult.candidates[0], quality }, alternative(quality)] }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user);
  expect(screen.getByText("Ver otras candidatas (1)").closest("details")).toHaveAttribute("open");
  expect(screen.getByRole("heading", { name: "Alternative printing" })).toBeVisible();
});

test("keeps only successfully saved condition, language and variant for the next card in this session", async () => {
  const request = setup(); const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user);
  await user.selectOptions(screen.getByLabelText("Estado de conservación"), "near_mint");
  await user.selectOptions(screen.getByLabelText("Idioma de la copia"), "ja");
  await user.selectOptions(screen.getByLabelText("Variante de impresión"), "reverse");
  await user.type(screen.getByLabelText("Fecha de adquisición"), "2026-11-01");
  await user.type(screen.getByLabelText("Notas personales"), "This card only");
  await user.click(screen.getByRole("button", { name: "Guardar copia" })); await screen.findByText("Copia añadida a tu colección.");
  await user.click(screen.getByRole("button", { name: "Escanear otra carta" })); await recognize(user); await select(user);
  expect(screen.getByLabelText("Estado de conservación")).toHaveValue("near_mint");
  expect(screen.getByLabelText("Idioma de la copia")).toHaveValue("ja"); expect(screen.getByLabelText("Variante de impresión")).toHaveValue("reverse");
  expect(screen.getByLabelText("Fecha de adquisición")).toHaveValue(""); expect(screen.getByLabelText("Notas personales")).toHaveValue("");
  expect(writes(request)).toHaveLength(1); expect(Object.keys(localStorage)).toEqual(["pokevault.locale"]); expect(sessionStorage.length).toBe(0);
  await user.selectOptions(screen.getByLabelText("Idioma de la copia"), "fr"); await user.click(screen.getByRole("button", { name: "Cancelar" })); await select(user);
  expect(screen.getByLabelText("Idioma de la copia")).toHaveValue("ja");
});

test("discards last-saved scan defaults when the confirmed account changes", async () => {
  let switched = false;
  setup((url) => url.pathname.endsWith("/auth/me") && switched ? json({ ...setSession, user: { ...setSession.user, id: "misty" } }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user);
  await user.selectOptions(screen.getByLabelText("Idioma de la copia"), "ja"); await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  await screen.findByText("Copia añadida a tu colección."); await user.click(screen.getByRole("button", { name: "Escanear otra carta" })); await recognize(user); await select(user);
  expect(screen.getByLabelText("Idioma de la copia")).toHaveValue("ja");
  switched = true; await act(async () => window.dispatchEvent(new Event("focus"))); await recognize(user); await select(user);
  expect(screen.getByLabelText("Idioma de la copia")).toHaveValue("en"); expect(screen.getByLabelText("Estado de conservación")).toHaveValue("unknown"); expect(screen.getByLabelText("Variante de impresión")).toHaveValue("unknown");
});

test("automatically recognizes one valid photograph without selecting or saving its suggestion", async () => {
  const request = setup(); const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo());
  expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toHaveTextContent("sm9-33");
  expect(screen.getByRole("button", { name: "Identificación manual" })).toHaveAttribute("aria-expanded", "false");
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Pikachu & Zekrom-GX" })).toBeVisible();
  expect(request.mock.calls.filter(([input]) => input.includes("/recognize"))).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Save copy" })).not.toBeInTheDocument(); expect(writes(request)).toHaveLength(0);
});

test("waits for scanner availability before automatically recognizing the already selected file", async () => {
  let finish!: (response: Response) => void;
  const request = setup((url) => url.pathname.endsWith("/capabilities") ? new Promise<Response>((resolve) => { finish = resolve; }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo());
  expect(request.mock.calls.some(([input]) => input.includes("/recognize"))).toBe(false);
  await act(async () => finish(json(scanCapabilities)));
  expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toHaveTextContent("sm9-33");
  expect(request.mock.calls.filter(([input]) => input.includes("/recognize"))).toHaveLength(1);
});

test.each([["camera.heic", "image/heic", "image/heic"], ["camera.heif", "image/heif", "image/heif"], ["IPHONE.HEIC", "", "image/heic"], ["camera.heif", "application/octet-stream", "image/heif"]])("identifies %s %s directly when native decoding is available without a broken preview", async (name, type, expectedType) => {
  const request = setup((url) => url.pathname.endsWith("/capabilities") ? json({ ...scanCapabilities, formats: [...scanCapabilities.formats, "image/heic", "image/heif"] }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  const upload = await screen.findByLabelText("Elegir imagen o fototeca"); const file = photo(name, type);
  await waitFor(() => expect(upload).toHaveAttribute("accept", expect.stringContaining(".heic")));
  await user.upload(upload, file);
  expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toHaveTextContent("sm9-33");
  expect(screen.getByText("La vista previa de HEIC/HEIF no está disponible aquí. Puedes continuar con la identificación.")).toBeVisible();
  expect(screen.queryByRole("img", { name: "Vista previa de la carta" })).not.toBeInTheDocument(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  const scans = request.mock.calls.filter(([input]) => input.includes("/recognize")); expect(scans).toHaveLength(1);
  expect(scans[0][1]?.body).toBe(file); expect(scans[0][1]?.headers).toMatchObject({ "Content-Type": expectedType }); expect(writes(request)).toHaveLength(0);
});

test("lets manual edits supersede an automatic scan waiting for availability", async () => {
  let finish!: (response: Response) => void;
  const request = setup((url) => url.pathname.endsWith("/capabilities") ? new Promise<Response>((resolve) => { finish = resolve; }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo()); await user.click(screen.getByRole("button", { name: "Identificación manual" }));
  await user.type(screen.getByRole("textbox", { name: "Nombre de carta" }), "My corrected name");
  await act(async () => finish(json(scanCapabilities)));
  expect(screen.getByRole("textbox", { name: "Nombre de carta" })).toHaveValue("My corrected name");
  expect(request.mock.calls.some(([input]) => input.includes("/recognize"))).toBe(false);
});

test("aborts an automatic scan when its photo is replaced and ignores the old result", async () => {
  let finish!: (response: Response) => void; let oldSignal: AbortSignal | undefined;
  setup((url, options) => {
    if (!url.pathname.endsWith("/recognize")) return;
    if ((options?.body as File).name === "first.jpg") { oldSignal = options?.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve; }); }
    return json({ ...recognizeResult, candidates: [{ ...scanResult.candidates[0], card: { ...scanResult.candidates[0].card, name: "Newest card" } }] });
  });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); const upload = await screen.findByLabelText("Elegir imagen o fototeca");
  await user.upload(upload, photo("first.jpg")); await waitFor(() => expect(finish).toBeTypeOf("function"));
  await user.upload(upload, photo("second.jpg")); expect(oldSignal?.aborted).toBe(true);
  expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toHaveTextContent("Newest card");
  await act(async () => finish(json(recognizeResult)));
  expect(screen.getByRole("list", { name: "Cartas candidatas" })).not.toHaveTextContent("Pikachu & Zekrom-GX");
});

test.each(["misty", "expired"])("discards a queued native camera callback when validation returns %s", async (owner) => {
  let checking = false; let finish!: (response: Response) => void;
  const request = setup((url) => url.pathname.endsWith("/auth/me") && checking ? new Promise<Response>((resolve) => { finish = resolve; }) : undefined);
  render(<App initialEntries={["/scanner"]} />); const camera = await screen.findByLabelText("Tomar fotografía");
  checking = true; await act(async () => window.dispatchEvent(new Event("focus")));
  fireEvent.change(camera, { target: { files: [photo("camera.jpg")] } });
  expect(request.mock.calls.some(([input]) => input.includes("/recognize"))).toBe(false);
  await act(async () => finish(owner === "expired" ? json({}, 401) : json({ ...setSession, user: { ...setSession.user, id: owner } })));
  expect(screen.queryByRole("img", { name: "Vista previa de la carta" })).not.toBeInTheDocument();
  expect(request.mock.calls.some(([input]) => input.includes("/recognize"))).toBe(false); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-1");
});

test("offers sign in and public expansion browsing without private scanner requests", async () => {
  const request = setup(undefined, false); render(<App initialEntries={["/scanner"]} />);
  expect(await screen.findByRole("link", { name: "Inicia sesión para escanear y añadir cartas." })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "Buscar en las expansiones" })).toHaveAttribute("href", "/sets");
  expect(screen.queryByLabelText("Elegir imagen o fototeca")).not.toBeInTheDocument();
  expect(request.mock.calls.some(([input]) => input.includes("/scans/"))).toBe(false);
  // 8A: the scanner moved from the nav to the header scan action; the page keeps its title.
  expect(within(screen.getByRole("banner")).getByRole("link", { name: "Escanear" })).toHaveAttribute("href", "/scanner");
  expect(screen.getByRole("heading", { level: 1, name: "Escáner de cartas" })).toBeInTheDocument();
});

test("uses distinct native library and rear-camera inputs and revokes replaced, removed and unmounted previews", async () => {
  setup(); const user = userEvent.setup(); const view = render(<App initialEntries={["/scanner"]} />);
  const upload = await screen.findByLabelText("Elegir imagen o fototeca"); const camera = screen.getByLabelText("Tomar fotografía");
  expect(upload).toHaveAttribute("type", "file"); expect(upload).not.toHaveAttribute("capture");
  expect(camera).toHaveAttribute("capture", "environment"); expect(camera).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  await user.upload(upload, photo()); expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toHaveAttribute("src", "blob:card-1");
  await user.upload(camera, photo("new.png", "image/png")); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-1");
  expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toHaveAttribute("src", "blob:card-2");
  await user.click(screen.getByRole("button", { name: "Quitar imagen" })); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-2");
  await user.upload(upload, photo()); view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-3");
});

test("rejects unsupported, empty and oversized files while preserving the valid preview", async () => {
  const request = setup(); const user = userEvent.setup({ applyAccept: false }); render(<App initialEntries={["/scanner"]} />);
  const input = await screen.findByLabelText("Elegir imagen o fototeca"); await user.upload(input, photo());
  await user.upload(input, photo("camera.heic", "image/heic")); expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG");
  await user.upload(input, new File([], "empty.jpg", { type: "image/jpeg" })); expect(screen.getByRole("alert")).toHaveTextContent("vacía");
  const big = photo(); Object.defineProperty(big, "size", { value: 8388609 }); await user.upload(input, big);
  expect(screen.getByRole("alert")).toHaveTextContent("8 MiB");
  expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toHaveAttribute("src", "blob:card-1");
  expect(request.mock.calls.filter(([input]) => input.includes("/recognize"))).toHaveLength(1);
});

test("requires explicit candidate selection and physical-copy save with exact destination links", async () => {
  const request = setup(); const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo());
  const candidates = await screen.findByRole("list", { name: "Cartas candidatas" });
  expect(candidates).toHaveTextContent("Pikachu & Zekrom-GX"); expect(candidates).toHaveTextContent("sm9-33"); expect(candidates).toHaveTextContent("Team Up");
  expect(candidates).toHaveTextContent("Coincidencia sólida"); expect(candidates).toHaveTextContent("Número coincidente");
  expect(within(candidates).getByRole("link", { name: "Ver detalles de la carta" })).toHaveAttribute("href", "/cards/sm9-33?returnTo=%2Fscanner");
  expect(request.mock.calls.some(([input]) => input.includes("/api/v1/cards/"))).toBe(false); expect(writes(request)).toHaveLength(0);
  await select(user); expect(screen.getByRole("heading", { name: "Confirmar copia física" })).toBeVisible(); expect(writes(request)).toHaveLength(0);
  const ownRequest = request.mock.calls.find(([input]) => new URL(input).pathname === "/api/v1/inventory")!;
  expect(new URL(ownRequest[0]).searchParams.get("card_id")).toBe("sm9-33");
  await user.selectOptions(screen.getByLabelText("Estado de conservación"), "near_mint");
  await user.selectOptions(screen.getByLabelText("Idioma de la copia"), "ja");
  await user.selectOptions(screen.getByLabelText("Variante de impresión"), "reverse");
  await user.type(screen.getByLabelText("Fecha de adquisición"), "2026-11-01");
  await user.type(screen.getByLabelText("Notas personales"), "Physical card verified");
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(await screen.findByText("Copia añadida a tu colección.")).toBeVisible();
  expect(screen.getByText(scannedCopy.id)).toBeVisible();
  expect(screen.getByRole("link", { name: "Ver copia guardada" })).toHaveAttribute("href", `/collection/${scannedCopy.id}`);
  expect(screen.getByRole("link", { name: "Ver carta guardada" })).toHaveAttribute("href", "/cards/sm9-33?returnTo=%2Fscanner");
  expect(screen.getByRole("link", { name: "Ver expansión y finalización" })).toHaveAttribute("href", "/sets/sm9");
  expect(JSON.parse(writes(request)[0][1]!.body as string)).toEqual({ card_id: "sm9-33", condition: "near_mint", language: "ja", variant: "reverse", acquired_on: "2026-11-01", notes: "Physical card verified" });
  expect(writes(request)[0][1]!.headers).toMatchObject({ "Idempotency-Key": expect.stringMatching(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i) });
  await user.click(screen.getByRole("button", { name: "Escanear otra carta" }));
  expect(screen.queryByRole("img", { name: "Vista previa de la carta" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Nombre de carta")).toHaveValue("");
});

test.each([[413, "upload_too_large", "8 MiB"], [415, "unsupported_image", "JPEG, PNG"], [422, "invalid_image", "imagen"], [429, "scanner_busy", "ocupado"], [503, "ocr_unavailable", "manualmente"], [504, "ocr_timeout", "tiempo"]])("keeps preview and manual correction after recognition error %s and supports explicit retry", async (status, code, message) => {
  let failed = true; setup((url) => url.pathname.endsWith("/recognize") && failed ? json({ detail: code }, status as number) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo()); await user.type(screen.getByLabelText("Nombre de carta"), "Pikachu");
  await user.click(screen.getByRole("button", { name: "Reconocer imagen" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message as string);
  expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible(); expect(screen.getByLabelText("Nombre de carta")).toHaveValue("Pikachu");
  failed = false; await user.click(screen.getByRole("button", { name: "Reconocer imagen" }));
  expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toHaveTextContent("sm9-33");
});

test("uses editable clues and verified expansion selection when OCR is unavailable", async () => {
  const request = setup((url) => url.pathname.endsWith("/capabilities") ? json({ ...scanCapabilities, available: false, languages: [] }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  expect(await screen.findByText("El reconocimiento OCR no está disponible. Puedes identificar la carta manualmente.")).toBeVisible();
  await user.type(screen.getByLabelText("Nombre de carta"), "Pikachu & Zekrom-GX");
  await user.type(screen.getByLabelText("Número de carta"), "033"); await user.type(screen.getByLabelText("Total impreso"), "80");
  await user.type(screen.getByRole("searchbox", { name: "Buscar expansión" }), "Team Up{Enter}");
  await user.click(await screen.findByRole("button", { name: "Team Up · sm9" }));
  await user.click(screen.getByRole("button", { name: "Buscar candidatas" }));
  expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toBeVisible();
  const call = request.mock.calls.find(([input]) => input.includes("/scans/match"))!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({ language: "es", clues: { name: "Pikachu & Zekrom-GX", local_number: "033", printed_total: 80, set_id: "sm9" } });
  expect(writes(request)).toHaveLength(0);
});

test("clears the selected expansion ID and hint before an unpinned candidate search", async () => {
  const request = setup(); const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await openManual(user);
  await user.type(await screen.findByLabelText("Nombre de carta"), "Pikachu");
  await user.type(screen.getByRole("searchbox", { name: "Buscar expansión" }), "Team Up{Enter}");
  await user.click(await screen.findByRole("button", { name: "Team Up · sm9" }));
  expect(screen.getByLabelText("Nombre o código de expansión")).toHaveValue("Team Up");
  await user.click(screen.getByRole("button", { name: "Quitar expansión seleccionada" }));
  expect(screen.getByLabelText("Nombre o código de expansión")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Buscar candidatas" }));
  await screen.findByRole("list", { name: "Cartas candidatas" });
  const match = request.mock.calls.find(([input]) => input.includes("/scans/match"))!;
  expect(JSON.parse(match[1]!.body as string).clues).toMatchObject({ name: "Pikachu", set_id: null, set_hint: "" });
});

test("cancels recognition and ignores late results before an explicit retry", async () => {
  let finish!: (response: Response) => void; let signal: AbortSignal | undefined; let first = true;
  setup((url, options) => { if (url.pathname.endsWith("/recognize") && first) { first = false; signal = options?.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve; }); } });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo());
  await user.click(screen.getByRole("button", { name: "Cancelar reconocimiento" })); expect(signal?.aborted).toBe(true);
  await act(async () => finish(json(recognizeResult))); expect(screen.queryByRole("list", { name: "Cartas candidatas" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Reconocer imagen" })); expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toBeVisible();
});

test("aborts stale matching on clue edits and keeps the newest keyboard search results", async () => {
  let finish!: (response: Response) => void; let oldSignal: AbortSignal | undefined;
  setup((url, options) => {
    if (!url.pathname.endsWith("/match")) return;
    const clues = JSON.parse(options!.body as string).clues;
    if (clues.name === "Old") { oldSignal = options?.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve; }); }
    return json({ ...scanResult, candidates: [{ ...scanResult.candidates[0], card: { ...scanResult.candidates[0].card, name: "Newest card" } }] });
  });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await openManual(user);
  const name = await screen.findByLabelText("Nombre de carta"); await user.type(name, "Old{Enter}"); await waitFor(() => expect(finish).toBeTypeOf("function"));
  await user.clear(name); expect(oldSignal?.aborted).toBe(true); await user.type(name, "New{Enter}");
  expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toHaveTextContent("Newest card");
  await act(async () => finish(json(scanResult))); expect(screen.getByRole("list", { name: "Cartas candidatas" })).not.toHaveTextContent("Pikachu & Zekrom-GX");
});

test("ignores expansion search results superseded by a new query", async () => {
  let finish!: (response: Response) => void; let oldSignal: AbortSignal | undefined;
  setup((url, options) => { if (url.pathname !== "/api/v1/sets") return; if (url.searchParams.get("q") === "new") return json(setPage({ results: [{ ...setSummary, id: "sv03.5", name: "151" }] })); oldSignal = options?.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve; }); });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await openManual(user);
  const input = await screen.findByRole("searchbox", { name: "Buscar expansión" }); await user.type(input, "old{Enter}");
  await user.clear(input); await user.type(input, "new{Enter}"); expect(await screen.findByRole("button", { name: "151 · sv03.5" })).toBeVisible(); expect(oldSignal?.aborted).toBe(true);
  await act(async () => finish(json(setPage()))); expect(screen.queryByRole("button", { name: "Team Up · sm9" })).not.toBeInTheDocument();
});

test("admits empty and limited results and translates unknown warnings without rendering server codes", async () => {
  setup((url) => url.pathname.endsWith("/match") ? json({ ...scanResult, candidates: [], status: "no_match", limited: true, warnings: ["provider_partial", "future_notice"] }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  await openManual(user);
  await user.type(await screen.findByLabelText("Nombre de carta"), "Unknown{Enter}");
  expect(await screen.findByText("No se encontraron candidatas. Corrige los datos o explora las expansiones.")).toBeVisible();
  expect(screen.getByText("La búsqueda fue limitada; pueden existir otras impresiones.")).toBeVisible();
  expect(screen.queryByText(/future_notice|provider_partial/)).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Guardar copia" })).not.toBeInTheDocument();
});

test("reuses one UUID and original payload after an uncertain save, without automatic retries", async () => {
  let attempts = 0; const request = setup((url, options) => { if (url.pathname === "/api/v1/inventory" && options?.method === "POST" && ++attempts === 1) return Promise.reject(new TypeError("Connection lost")); });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user);
  await user.type(screen.getByLabelText("Notas personales"), "Keep original values"); await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("confirmar"); expect(writes(request)).toHaveLength(1); expect(screen.getByLabelText("Notas personales")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Reintentar la misma copia" })); expect(await screen.findByText("Copia añadida a tu colección.")).toBeVisible();
  expect(writes(request)).toHaveLength(2); expect(writes(request)[0][1]!.headers).toEqual(writes(request)[1][1]!.headers); expect(writes(request)[0][1]!.body).toBe(writes(request)[1][1]!.body);
  await user.click(screen.getByRole("button", { name: "Escanear otra carta" })); await recognize(user); await select(user); await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  await screen.findByText("Copia añadida a tu colección."); expect(writes(request)[2][1]!.headers).not.toEqual(writes(request)[0][1]!.headers);
});

test("blocks duplicate submissions and cancellation while one physical copy is saving", async () => {
  let finish!: (response: Response) => void; const request = setup((url, options) => url.pathname === "/api/v1/inventory" && options?.method === "POST" ? new Promise<Response>((resolve) => { finish = resolve; }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user);
  const form = screen.getByRole("button", { name: "Guardar copia" }).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form); expect(writes(request)).toHaveLength(1); expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await act(async () => finish(json(scannedCopy, 201))); expect(await screen.findByText("Copia añadida a tu colección.")).toBeVisible();
});

test("explains conflicting replay data without silently starting another copy", async () => {
  const request = setup((url, options) => url.pathname === "/api/v1/inventory" && options?.method === "POST" ? json({ detail: "idempotency_conflict" }, 409) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user); await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("datos distintos"); expect(screen.getByRole("button", { name: "Guardar copia" })).toBeDisabled(); expect(writes(request)).toHaveLength(1);
});

test("hides photos and aborts recognition during validation, then discards them when the session expires", async () => {
  let checking = false; let session!: (response: Response) => void; let finish!: (response: Response) => void; let scanSignal: AbortSignal | undefined;
  setup((url, options) => {
    if (url.pathname.endsWith("/auth/me") && checking) return new Promise<Response>((resolve) => { session = resolve; });
    if (url.pathname.endsWith("/recognize")) { scanSignal = options?.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve; }); }
  });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo());
  checking = true; await act(async () => window.dispatchEvent(new Event("focus"))); expect(scanSignal?.aborted).toBe(true); expect(screen.queryByRole("img", { name: "Vista previa de la carta" })).not.toBeInTheDocument(); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  await act(async () => session(json({}, 401))); await act(async () => finish(json(recognizeResult)));
  expect(await screen.findByRole("link", { name: "Inicia sesión para escanear y añadir cartas." })).toBeVisible(); expect(screen.queryByRole("list", { name: "Cartas candidatas" })).not.toBeInTheDocument(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-1");
});

test("discards an old account's pending save and ignores late success after account switching", async () => {
  let switched = false; let finish!: (response: Response) => void; let saveSignal: AbortSignal | undefined;
  setup((url, options) => { if (url.pathname.endsWith("/auth/me") && switched) return json({ ...setSession, user: { ...setSession.user, id: "misty" } }); if (url.pathname === "/api/v1/inventory" && options?.method === "POST") { saveSignal = options.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve; }); } });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user); await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  switched = true; await act(async () => window.dispatchEvent(new Event("focus"))); expect(saveSignal?.aborted).toBe(true);
  await screen.findByLabelText("Elegir imagen o fototeca"); await act(async () => finish(json(scannedCopy, 201)));
  expect(screen.queryByText("Copia añadida a tu colección.")).not.toBeInTheDocument(); expect(screen.queryByText("3 copias propias")).not.toBeInTheDocument(); expect(screen.getByLabelText("Nombre de carta")).toHaveValue("");
});

test("aborts private quantity and save requests when navigating away from confirmation", async () => {
  let finish!: (response: Response) => void; let saveSignal: AbortSignal | undefined;
  setup((url, options) => url.pathname === "/api/v1/inventory" && options?.method === "POST" ? (saveSignal = options.signal as AbortSignal, new Promise<Response>((resolve) => { finish = resolve; })) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user); await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  await user.click(screen.getByRole("link", { name: "Expansiones" })); expect(saveSignal?.aborted).toBe(true); await act(async () => finish(json(scannedCopy, 201))); expect(screen.queryByText("Copia añadida a tu colección.")).not.toBeInTheDocument();
});

test("provides English scanner controls, evidence, manual correction and confirmation", async () => {
  const request = setup(); const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await screen.findByLabelText("Elegir imagen o fototeca"); await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Card scanner" })).toBeVisible(); await user.upload(screen.getByLabelText("Choose image or photo library"), photo());
  await user.click(screen.getByRole("button", { name: "Manual identification" }));
  expect(await screen.findByText("Strong match")).toBeVisible(); expect(screen.getByText("Matching number")).toBeVisible(); expect(screen.getByLabelText("Card number")).toHaveValue("033");
  await user.click(screen.getByRole("button", { name: "Select this card" })); expect(await screen.findByText("3 owned copies")).toBeVisible(); expect(screen.getByLabelText("Copy language")).toBeVisible();
  expect(request.mock.calls.find(([input]) => input.includes("/recognize"))![0]).toContain("language=en");
});

test("returns from official card details to the scanner through a safe local link", async () => {
  setup(); const user = userEvent.setup(); render(<App initialEntries={["/cards/sm9-33?returnTo=%2Fscanner"]} />);
  expect(await screen.findByRole("link", { name: "Volver al escáner" })).toHaveAttribute("href", "/scanner");
  await user.click(screen.getByRole("link", { name: "Volver al escáner" })); expect(await screen.findByLabelText("Elegir imagen o fototeca")).toBeVisible();
});

test("opens detail inspection in a separate tab and retains the photo, corrected clues and selected form", async () => {
  setup(); const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user);
  const details = screen.getByRole("link", { name: "Ver detalles de la carta" });
  expect(details).toHaveAttribute("target", "_blank"); expect(details).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByText("Los detalles se abren en otra pestaña para conservar este escaneo.")).toBeVisible();
  await user.click(details); expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible(); expect(screen.getByLabelText("Número de carta")).toHaveValue("033");
  await select(user); await user.type(screen.getByLabelText("Notas personales"), "Keep this draft");
  const confirmationDetails = screen.getByRole("link", { name: "Ver detalles de la carta" }); expect(confirmationDetails).toHaveAttribute("target", "_blank");
  await user.click(confirmationDetails); expect(screen.getByLabelText("Notas personales")).toHaveValue("Keep this draft");
  expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible();
});

test.each(["ocr_engine_failed", "ocr_output_invalid"])("describes OCR failure %s without claiming the catalog is unavailable", async (code) => {
  setup((url) => url.pathname.endsWith("/recognize") ? json({ detail: code }, 503) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo()); await user.click(screen.getByRole("button", { name: "Reconocer imagen" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("El OCR no pudo procesar la imagen"); expect(screen.getByRole("alert")).not.toHaveTextContent("catálogo");
  expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible();
});

test("keeps a verified long expansion name within manual clue bounds", async () => {
  const longName = "Very long expansion title ".repeat(6);
  const request = setup((url) => url.pathname === "/api/v1/sets" ? json(setPage({ results: [{ ...setSummary, name: longName }] })) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await openManual(user); await user.type(await screen.findByRole("searchbox", { name: "Buscar expansión" }), "sm9{Enter}");
  await user.click(await screen.findByRole("button", { name: `${longName.trim()} · sm9` }));
  await user.type(screen.getByLabelText("Número de carta"), "33{Enter}"); expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toBeVisible();
  const match = request.mock.calls.find(([input]) => input.includes("/scans/match"))!;
  expect(JSON.parse(match[1]!.body as string).clues).toMatchObject({ set_id: "sm9", set_hint: "Very long expansion title Very long expansion title Very long expansion title Very long expansion ti" });
});

test("reports unavailable owned quantity honestly, retries it, and still requires explicit saving", async () => {
  let failed = true; const request = setup((url, options) => url.pathname === "/api/v1/inventory" && options?.method !== "POST" && failed ? json({}, 503) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await user.click(screen.getByRole("button", { name: "Seleccionar esta carta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo comprobar cuántas copias tienes"); expect(screen.queryByText("0 copias propias")).not.toBeInTheDocument(); expect(writes(request)).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Guardar copia" })).toBeEnabled(); failed = false; await user.click(screen.getByRole("button", { name: "Reintentar cantidad propia" })); expect(await screen.findByText("3 copias propias")).toBeVisible();
});

test("aborts a pending quantity check when cancelling selection and ignores its late private data", async () => {
  let finish!: (response: Response) => void; let quantitySignal: AbortSignal | undefined;
  setup((url, options) => { if (url.pathname === "/api/v1/inventory" && options?.method !== "POST") { quantitySignal = options?.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve; }); } });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await user.click(screen.getByRole("button", { name: "Seleccionar esta carta" }));
  await waitFor(() => expect(finish).toBeTypeOf("function")); await user.click(screen.getByRole("button", { name: "Cancelar" })); expect(quantitySignal?.aborted).toBe(true);
  await act(async () => finish(json({ results: [scannedCopy], total: 3, quantities: { "sm9-33": 3 }, offset: 0, limit: 24 })));
  expect(screen.queryByText("3 copias propias")).not.toBeInTheDocument(); expect(screen.getByRole("list", { name: "Cartas candidatas" })).toBeVisible(); expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible();
});

test("retries OCR capabilities while preserving manual fallback and the selected photo", async () => {
  let failed = true; setup((url) => url.pathname.endsWith("/capabilities") && failed ? json({}, 503) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  expect(await screen.findByText("No se pudo comprobar el OCR. La búsqueda manual sigue disponible.")).toBeVisible();
  await user.upload(screen.getByLabelText("Elegir imagen o fototeca"), photo()); expect(screen.getByRole("button", { name: "Reconocer imagen" })).toBeDisabled();
  await user.type(screen.getByLabelText("Nombre de carta"), "Pikachu{Enter}"); expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toBeVisible();
  failed = false; await user.click(screen.getByRole("button", { name: "Reintentar disponibilidad OCR" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Reconocer imagen" })).toBeEnabled()); expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible();
});

test.each([401, 403])("revalidates scanner session on status %s and discards private OCR state", async (status) => {
  let sessions = 0; let scans = 0; setup((url) => { if (url.pathname.endsWith("/auth/me")) return ++sessions === 1 ? json(setSession) : json({}, 401); if (url.pathname.endsWith("/recognize") && ++scans > 1) return json({}, status); });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await openManual(user); await user.clear(screen.getByLabelText("Nombre de carta")); await user.type(screen.getByLabelText("Nombre de carta"), "Private clue"); await user.click(screen.getByRole("button", { name: "Reconocer imagen" }));
  expect(await screen.findByRole("link", { name: "Inicia sesión para escanear y añadir cartas." })).toBeVisible(); expect(screen.queryByLabelText("Nombre de carta")).not.toBeInTheDocument(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-1");
});

test("does not persist the photo, extracted clues or private ownership in browser storage", async () => {
  setup(); const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user);
  expect(Object.keys(localStorage)).toEqual(["pokevault.locale"]); expect(localStorage.getItem("pokevault.locale")).toBe("es"); expect(sessionStorage.length).toBe(0);
});

test("keeps secure UUIDv4 retry identity when randomUUID is unavailable on a local mobile origin", async () => {
  vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
  let attempts = 0; const request = setup((url, options) => url.pathname === "/api/v1/inventory" && options?.method === "POST" && ++attempts === 1 ? Promise.reject(new TypeError("Lost response")) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user); await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  await screen.findByRole("alert"); await user.click(screen.getByRole("button", { name: "Reintentar la misma copia" })); expect(await screen.findByText("Copia añadida a tu colección.")).toBeVisible();
  const first = writes(request)[0][1]!.headers as Record<string, string>; const second = writes(request)[1][1]!.headers as Record<string, string>;
  expect(first["Idempotency-Key"]).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i); expect(second["Idempotency-Key"]).toBe(first["Idempotency-Key"]);
});

test.each(["focus", "pageshow", "visibilitychange"])("preserves the same owner's photo, clues and candidates across %s revalidation", async (eventName) => {
  let checking = false; let finishSession!: (response: Response) => void;
  setup((url) => url.pathname.endsWith("/auth/me") && checking ? new Promise<Response>((resolve) => { finishSession = resolve; }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user);
  const preview = screen.getByRole("img", { name: "Vista previa de la carta" }); const name = screen.getByLabelText("Nombre de carta");
  await user.click(screen.getByRole("link", { name: "Ver detalles de la carta" })); checking = true;
  if (eventName === "visibilitychange") vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => (eventName === "visibilitychange" ? document : window).dispatchEvent(new Event(eventName)));
  expect(preview).toBeInTheDocument(); expect(preview).not.toBeVisible(); expect(preview.closest("[inert]")).not.toBeNull();
  expect(screen.queryByRole("list", { name: "Cartas candidatas" })).not.toBeInTheDocument(); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  await act(async () => finishSession(json(setSession)));
  expect(preview).toBeVisible(); expect(name).toHaveValue("Pikachu & Zekrom-GX"); expect(screen.getByLabelText("Número de carta")).toHaveValue("033");
  expect(screen.getByRole("list", { name: "Cartas candidatas" })).toHaveTextContent("sm9-33"); expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});

test("preserves selection and physical-copy draft after returning focus from card details", async () => {
  let checking = false; let finishSession!: (response: Response) => void;
  setup((url) => url.pathname.endsWith("/auth/me") && checking ? new Promise<Response>((resolve) => { finishSession = resolve; }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user);
  const notes = screen.getByLabelText("Notas personales"); await user.type(notes, "Verified physical copy"); await user.selectOptions(screen.getByLabelText("Idioma de la copia"), "ja");
  await user.click(screen.getByRole("link", { name: "Ver detalles de la carta" })); checking = true; await act(async () => window.dispatchEvent(new Event("focus")));
  expect(notes).toBeInTheDocument(); expect(notes).not.toBeVisible(); expect(notes).toBeDisabled();
  await act(async () => finishSession(json(setSession)));
  expect(screen.getByRole("heading", { name: "Confirmar copia física" })).toBeVisible(); expect(notes).toHaveValue("Verified physical copy"); expect(notes).toBeEnabled();
  expect(screen.getByLabelText("Idioma de la copia")).toHaveValue("ja"); expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible();
});

test("accepts the native camera file callback while the same owner's session is validating", async () => {
  let checking = false; let finishSession!: (response: Response) => void;
  const request = setup((url) => url.pathname.endsWith("/auth/me") && checking ? new Promise<Response>((resolve) => { finishSession = resolve; }) : undefined);
  render(<App initialEntries={["/scanner"]} />); const camera = await screen.findByLabelText("Tomar fotografía");
  checking = true; await act(async () => window.dispatchEvent(new Event("focus")));
  fireEvent.change(camera, { target: { files: [photo("camera.jpg")] } });
  expect(request.mock.calls.some(([input]) => input.includes("/recognize"))).toBe(false);
  await act(async () => finishSession(json({ ...setSession, csrf_token: "fresh-camera-token" })));
  expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toHaveAttribute("src", "blob:card-1"); expect(screen.getByText("camera.jpg")).toBeVisible();
  expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toHaveTextContent("sm9-33");
  const scans = request.mock.calls.filter(([input]) => input.includes("/recognize")); expect(scans).toHaveLength(1);
  expect(scans[0][1]?.headers).toMatchObject({ "X-CSRF-Token": "fresh-camera-token" }); expect(writes(request)).toHaveLength(0);
});

test("suspends a pending create during validation and resumes explicit retry with the same UUID and original values", async () => {
  let checking = false; let finishSession!: (response: Response) => void; let finishSave!: (response: Response) => void; let saveSignal: AbortSignal | undefined; let attempts = 0;
  const request = setup((url, options) => {
    if (url.pathname.endsWith("/auth/me") && checking) return new Promise<Response>((resolve) => { finishSession = resolve; });
    if (url.pathname === "/api/v1/inventory" && options?.method === "POST" && ++attempts === 1) { saveSignal = options.signal as AbortSignal; return new Promise<Response>((resolve) => { finishSave = resolve; }); }
  });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await select(user); await user.type(screen.getByLabelText("Notas personales"), "One physical copy");
  const form = screen.getByRole("button", { name: "Guardar copia" }).closest("form")!; await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  checking = true; await act(async () => window.dispatchEvent(new Event("focus"))); expect(saveSignal?.aborted).toBe(true); expect(form).toBeInTheDocument(); expect(form).not.toBeVisible();
  fireEvent.submit(form); expect(writes(request)).toHaveLength(1);
  await act(async () => finishSession(json({ ...setSession, csrf_token: "refreshed-csrf" })));
  expect(await screen.findByRole("button", { name: "Reintentar la misma copia" })).toBeEnabled(); expect(screen.getByLabelText("Notas personales")).toHaveValue("One physical copy"); expect(screen.getByLabelText("Notas personales")).toBeDisabled();
  await act(async () => finishSave(json(scannedCopy, 201))); expect(screen.queryByText("Copia añadida a tu colección.")).not.toBeInTheDocument(); expect(writes(request)).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Reintentar la misma copia" })); expect(await screen.findByText("Copia añadida a tu colección.")).toBeVisible();
  const original = writes(request)[0][1]!; const replay = writes(request)[1][1]!;
  expect((replay.headers as Record<string, string>)["Idempotency-Key"]).toBe((original.headers as Record<string, string>)["Idempotency-Key"]);
  expect((replay.headers as Record<string, string>)["X-CSRF-Token"]).toBe("refreshed-csrf"); expect(replay.body).toBe(original.body);
});

test("cancels in-flight OCR on validation and keeps the photo and manual clues for explicit same-owner retry", async () => {
  let checking = false; let finishSession!: (response: Response) => void; let finishScan!: (response: Response) => void; let signal: AbortSignal | undefined; let attempts = 0;
  setup((url, options) => {
    if (url.pathname.endsWith("/auth/me") && checking) return new Promise<Response>((resolve) => { finishSession = resolve; });
    if (url.pathname.endsWith("/recognize") && ++attempts === 2) { signal = options?.signal as AbortSignal; return new Promise<Response>((resolve) => { finishScan = resolve; }); }
  });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await openManual(user); await user.clear(screen.getByLabelText("Nombre de carta")); await user.type(screen.getByLabelText("Nombre de carta"), "Keep my clue"); await user.click(screen.getByRole("button", { name: "Reconocer imagen" }));
  checking = true; await act(async () => window.dispatchEvent(new Event("focus"))); expect(signal?.aborted).toBe(true); await act(async () => finishScan(json(recognizeResult)));
  await act(async () => finishSession(json(setSession)));
  expect(screen.getByLabelText("Nombre de carta")).toHaveValue("Keep my clue"); expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible(); expect(screen.queryByRole("list", { name: "Cartas candidatas" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reconocer imagen" })); expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toBeVisible();
});

test("aborts capabilities, matching and expansion queries during validation and ignores late results", async () => {
  let checking = false; let finishSession!: (response: Response) => void;
  const signals: AbortSignal[] = []; const completions: ((response: Response) => void)[] = []; const seen = new Set<string>();
  const request = setup((url, options) => {
    if (url.pathname.endsWith("/auth/me") && checking) return new Promise<Response>((resolve) => { finishSession = resolve; });
    if (["/api/v1/scans/capabilities", "/api/v1/scans/match", "/api/v1/sets"].includes(url.pathname) && !seen.has(url.pathname)) {
      seen.add(url.pathname); signals.push(options?.signal as AbortSignal); return new Promise<Response>((resolve) => { completions.push(resolve); });
    }
  });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await openManual(user); await user.type(await screen.findByLabelText("Nombre de carta"), "Pikachu{Enter}"); await user.type(screen.getByRole("searchbox", { name: "Buscar expansión" }), "Team Up{Enter}");
  checking = true; await act(async () => window.dispatchEvent(new Event("focus"))); expect(signals).toHaveLength(3); expect(signals.every((signal) => signal.aborted)).toBe(true);
  await act(async () => { completions[0](json(scanCapabilities)); completions[1](json(scanResult)); completions[2](json(setPage())); }); await act(async () => finishSession(json(setSession)));
  expect(screen.getByLabelText("Nombre de carta")).toHaveValue("Pikachu"); expect(screen.getByRole("searchbox", { name: "Buscar expansión" })).toHaveValue("Team Up");
  expect(screen.queryByRole("list", { name: "Cartas candidatas" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Team Up · sm9" })).not.toBeInTheDocument();
  expect(request.mock.calls.filter(([input]) => input.includes("/scans/match"))).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Buscar candidatas" })); expect(await screen.findByRole("list", { name: "Cartas candidatas" })).toBeVisible();
});

test("suspends owned quantity checks, retains the form, and refreshes quantity for the confirmed same owner", async () => {
  let checking = false; let finishSession!: (response: Response) => void; let finishQuantity!: (response: Response) => void; let signal: AbortSignal | undefined; let first = true;
  setup((url, options) => {
    if (url.pathname.endsWith("/auth/me") && checking) return new Promise<Response>((resolve) => { finishSession = resolve; });
    if (url.pathname === "/api/v1/inventory" && options?.method !== "POST") {
      if (first) { first = false; signal = options?.signal as AbortSignal; return new Promise<Response>((resolve) => { finishQuantity = resolve; }); }
      return json({ results: [], total: 0, quantities: {}, offset: 0, limit: 24 });
    }
  });
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); await user.click(screen.getByRole("button", { name: "Seleccionar esta carta" })); await user.type(screen.getByLabelText("Notas personales"), "Keep selection");
  checking = true; await act(async () => window.dispatchEvent(new Event("focus"))); expect(signal?.aborted).toBe(true); await act(async () => finishSession(json(setSession)));
  expect(await screen.findByText("0 copias propias")).toBeVisible(); await act(async () => finishQuantity(json({ results: [scannedCopy], total: 3, quantities: { "sm9-33": 3 }, offset: 0, limit: 24 })));
  expect(screen.queryByText("3 copias propias")).not.toBeInTheDocument(); expect(screen.getByLabelText("Notas personales")).toHaveValue("Keep selection");
});

test("discards the retained scan when revalidation cannot confirm the account", async () => {
  let checking = false; let rejectSession!: (reason: unknown) => void;
  setup((url) => url.pathname.endsWith("/auth/me") && checking ? new Promise<Response>((_resolve, reject) => { rejectSession = reject; }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />); await recognize(user); checking = true; await act(async () => window.dispatchEvent(new Event("focus")));
  expect(URL.revokeObjectURL).not.toHaveBeenCalled(); await act(async () => rejectSession(new TypeError("Session unavailable")));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo comprobar tu sesión"); expect(screen.queryByLabelText("Nombre de carta")).not.toBeInTheDocument(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-1");
});

test.each(["sm9-33", "sm9-34"])("starts a clean confirmed scan with a fresh registration identity for %s", async (nextId) => {
  let second = false;
  const request = setup((url) => url.pathname.endsWith("/recognize") && second
    ? json({ ...recognizeResult, candidates: [{ ...scanResult.candidates[0], card: { ...scanResult.candidates[0].card, id: nextId } }] }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/scanner"]} />);
  const file = photo();
  await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), file);
  await screen.findByRole("list", { name: "Cartas candidatas" }); await select(user);
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(await screen.findByText("Copia añadida a tu colección.")).toHaveFocus();
  second = true; await user.click(screen.getByRole("button", { name: "Escanear otra carta" }));
  const input = screen.getByLabelText("Elegir imagen o fototeca");
  expect(input).toHaveFocus(); expect(input).toHaveValue("");
  expect(screen.queryByRole("list", { name: "Cartas candidatas" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-1");
  await user.upload(input, file); await screen.findByRole("list", { name: "Cartas candidatas" });
  expect(writes(request)).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Seleccionar esta carta" }));
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  await screen.findByText("Copia añadida a tu colección.");
  const registrations = writes(request); expect(registrations).toHaveLength(2);
  expect(JSON.parse(registrations[1][1]!.body as string).card_id).toBe(nextId);
  expect(new Headers(registrations[0][1]!.headers).get("Idempotency-Key"))
    .not.toBe(new Headers(registrations[1][1]!.headers).get("Idempotency-Key"));
});

function LogoutControl() {
  const auth = useAuth();
  return <button onClick={auth.logout}>Test logout</button>;
}

test.each(["recognize", "save"])("discards private state and ignores late %s completion when logout starts", async (operation) => {
  let finish!: (response: Response) => void; let signal: AbortSignal | undefined;
  const request = setup((url, options) => {
    if (url.pathname.endsWith("/auth/logout")) return new Promise<Response>(() => {});
    if ((operation === "recognize" && url.pathname.endsWith("/recognize")) ||
        (operation === "save" && url.pathname === "/api/v1/inventory" && options?.method === "POST")) {
      signal = options?.signal as AbortSignal;
      return new Promise<Response>((resolve) => { finish = resolve; });
    }
  });
  const user = userEvent.setup();
  render(<LocaleProvider><AuthProvider><MemoryRouter><LogoutControl /><ScannerPage /></MemoryRouter></AuthProvider></LocaleProvider>);
  await user.upload(await screen.findByLabelText("Elegir imagen o fototeca"), photo());
  if (operation === "save") {
    await screen.findByRole("list", { name: "Cartas candidatas" }); await select(user);
    await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  }
  await waitFor(() => expect(signal).toBeDefined());
  await user.click(screen.getByRole("button", { name: "Test logout" }));
  expect(signal?.aborted).toBe(true); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-1");
  await act(async () => finish(json(operation === "save" ? scannedCopy : recognizeResult)));
  expect(screen.queryByRole("list", { name: "Cartas candidatas" })).not.toBeInTheDocument();
  expect(screen.queryByText("Copia añadida a tu colección.")).not.toBeInTheDocument();
  expect(screen.queryByText("3 copias propias")).not.toBeInTheDocument();
  expect(writes(request)).toHaveLength(operation === "save" ? 1 : 0);
});
