import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth } from "../auth/context";

const userProfile = { id: "4f6a3fab-002c-44e1-b3e8-0247badc013c", display_name: "Ash Ketchum", email: "ash@example.test", email_verified: true, picture_url: "https://lh3.googleusercontent.com/profile" };
const session = { user: userProfile, csrf_token: "test-csrf-token" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => vi.unstubAllGlobals());

test("restores the real profile once in StrictMode, shows loading and never persists credentials", async () => {
  let finish!: (response: Response) => void;
  const request = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", request);
  render(<StrictMode><App initialEntries={["/profile"]} /></StrictMode>);
  expect(screen.getByRole("status")).toHaveTextContent("Comprobando sesión…");
  expect(screen.queryByText("Ash Ketchum")).not.toBeInTheDocument();
  await act(async () => { finish(json(session)); });
  expect(await screen.findByRole("heading", { name: "Ash Ketchum" })).toBeVisible();
  expect(screen.getByText("ash@example.test")).toBeVisible();
  expect(screen.getByText("Sesión iniciada con Google")).toBeVisible();
  expect(screen.getByRole("img", { name: "Foto de Ash Ketchum" })).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/auth/me", expect.objectContaining({ credentials: "include", headers: { Accept: "application/json" } }));
  expect(Object.keys(localStorage)).toEqual(["pokevault.locale"]);
});

test("offers Google sign-in on an unauthenticated profile and localizes login", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await user.click(await screen.findByRole("link", { name: "Iniciar sesión" }));
  expect(screen.getByRole("heading", { name: "Tu cuenta de PokéVault" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Your PokéVault account" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
});

test("starts credentialed Google login, disables repeated clicks and navigates to Google", async () => {
  let complete!: (response: Response) => void;
  const assign = vi.fn();
  vi.stubGlobal("location", { assign });
  const request = vi.fn((input: string) => input.endsWith("/me") ? Promise.resolve(json({}, 401)) : new Promise<Response>((resolve) => { complete = resolve; }));
  vi.stubGlobal("fetch", request);
  const user = userEvent.setup();
  render(<App initialEntries={["/login"]} />);
  const button = await screen.findByRole("button", { name: "Continuar con Google" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  expect(screen.getByRole("button", { name: "Conectando con Google…" })).toBeDisabled();
  await act(async () => { complete(json({ authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?state=example" })); });
  expect(assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=example");
  expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/auth/google/login", expect.objectContaining({ credentials: "include", headers: { Accept: "application/json" } }));
});

test.each([
  ["configuration", "Google aún no está configurado. Consulta la guía de desarrollo de PokéVault."],
  ["cancelled", "Se canceló el inicio de sesión. Puedes intentarlo de nuevo."],
  ["invalid_state", "El intento de inicio de sesión caducó o no es válido. Inténtalo de nuevo."],
  ["invalid_token", "No se pudo verificar tu identidad con Google. Inténtalo de nuevo."],
  ["provider_unavailable", "Google no está disponible en este momento. Inténtalo de nuevo."],
  ["database_unavailable", "No se pudo acceder a tu cuenta. Inténtalo de nuevo más tarde."],
  ["<script>secret</script>", "No se pudo iniciar sesión. Inténtalo de nuevo."],
])("sanitizes callback error %s", async (code, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
  render(<App initialEntries={[`/login?error=${encodeURIComponent(code)}`]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
});

test("shows safe login configuration failure and permits retry", async () => {
  vi.stubGlobal("fetch", vi.fn((input: string) => Promise.resolve(input.endsWith("/me") ? json({}, 401) : json({ detail: "configuration", internal: "secret" }, 503))));
  const user = userEvent.setup();
  render(<App initialEntries={["/login"]} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Continuar con Google" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Google aún no está configurado");
  expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
  expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
});

test("recovers from a failed session request without displaying response details", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ detail: "secret" }, 500)).mockResolvedValueOnce(json(session)));
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo comprobar tu sesión.");
  expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reintentar sesión" }));
  expect(await screen.findByRole("heading", { name: "Ash Ketchum" })).toBeVisible();
});

test.each([204, 401])("logout sends CSRF token and clears the profile for status %s", async (status) => {
  const request = vi.fn((input: string) => Promise.resolve(input.endsWith("/logout") ? new Response(null, { status }) : json(session)));
  vi.stubGlobal("fetch", request);
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toBeVisible();
  expect(screen.queryByText("ash@example.test")).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/auth/logout", expect.objectContaining({ method: "POST", credentials: "include", headers: { Accept: "application/json", "X-CSRF-Token": "test-csrf-token" } }));
});

test("keeps profile and exposes a retry after logout network failure", async () => {
  vi.stubGlobal("fetch", vi.fn((input: string) => input.endsWith("/logout") ? Promise.reject(new Error("secret")) : Promise.resolve(json(session))));
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cerrar la sesión. Inténtalo de nuevo.");
  expect(screen.getByRole("heading", { name: "Ash Ketchum" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeEnabled();
});

test("falls back for a broken profile picture and omits missing email", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...session, user: { ...userProfile, email: null, picture_url: "https://example.test/broken.png" } })));
  render(<App initialEntries={["/profile"]} />);
  fireEvent.error(await screen.findByRole("img", { name: "Foto de Ash Ketchum" }));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("AK")).toBeVisible();
  expect(screen.queryByText("ash@example.test")).not.toBeInTheDocument();
});

test("prevents a late refresh from restoring a logged out identity", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(session)).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; })).mockResolvedValueOnce(new Response(null, { status: 204 })));
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await screen.findByRole("heading", { name: "Ash Ketchum" });
  fireEvent.focus(window);
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toBeVisible();
  await act(async () => { finish(json(session)); });
  expect(screen.queryByText("Ash Ketchum")).not.toBeInTheDocument();
});

test("replaces an expired session with the sign-in action on focus", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json({}, 401)));
  render(<App initialEntries={["/profile"]} />);
  await screen.findByRole("heading", { name: "Ash Ketchum" });
  fireEvent.focus(window);
  expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toBeVisible();
});

test("keeps the public Pokédex accessible while session restoration is pending", async () => {
  vi.stubGlobal("fetch", vi.fn((input: string) => input.endsWith("/auth/me") ? new Promise<Response>(() => undefined) : Promise.resolve(json({ results: [{ national_dex_number: 1, name: "bulbasaur", types: ["grass"], sprite_url: null }] }))));
  render(<App initialEntries={["/pokedex"]} />);
  expect(await screen.findByRole("heading", { name: "Bulbasaur" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Cajas" })).toHaveAttribute("href", "/boxes");
  expect(screen.getByRole("link", { name: "Ver cartas TCG" })).toHaveAttribute("href", "/pokemon/1/cards?returnTo=%2Fpokedex");
});

function SessionProbe() { const auth = useAuth(); return <output>{auth.status}</output>; }

test("a fresh provider never restores a previous provider's pending identity", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; })).mockResolvedValueOnce(json({}, 401)));
  const first = render(<AuthProvider><SessionProbe /></AuthProvider>);
  first.unmount();
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  expect(await screen.findByText("unauthenticated")).toBeVisible();
  await act(async () => { finish(json(session)); });
  expect(screen.getByText("unauthenticated")).toBeVisible();
});

test("coalesces overlapping revalidation events without requesting a session on route changes", async () => {
  let finish!: (response: Response) => void;
  const request = vi.fn().mockResolvedValueOnce(json(session)).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", request);
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await screen.findByRole("heading", { name: "Ash Ketchum" });
  await user.click(screen.getByRole("link", { name: "Perfil" }));
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.focus(window);
  fireEvent.focus(window);
  fireEvent(window, new Event("pageshow"));
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => { finish(json({}, 401)); });
  expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toBeVisible();
});

test("cancels a pending login on navigation away and never redirects the new route", async () => {
  let finish!: (response: Response) => void;
  const assign = vi.fn();
  const request = vi.fn<(input: string, options?: RequestInit) => Promise<Response>>((input) => input.endsWith("/me") ? Promise.resolve(json({}, 401)) : new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("location", { assign });
  vi.stubGlobal("fetch", request);
  const user = userEvent.setup();
  render(<App initialEntries={["/login"]} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Continuar con Google" }));
  await user.click(screen.getByRole("link", { name: "Perfil" }));
  const loginOptions = request.mock.calls.find(([url]) => url.endsWith("/google/login"))?.[1];
  expect(loginOptions?.signal?.aborted).toBe(true);
  await act(async () => { finish(json({ authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?state=example" })); });
  expect(assign).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Perfil" })).toBeVisible();
});

test("shows translated authenticated profile and disables pending sign-out", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn((input: string) => input.endsWith("/me") ? Promise.resolve(json(session)) : new Promise<Response>((resolve) => { finish = resolve; })));
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await screen.findByRole("heading", { name: "Ash Ketchum" });
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByText("Signed in with Google")).toBeVisible();
  expect(screen.getByRole("img", { name: "Photo of Ash Ketchum" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.getByRole("button", { name: "Signing out…" })).toBeDisabled();
  await act(async () => { finish(new Response(null, { status: 204 })); });
  expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
});

test("accepts an identity without optional Google name or email and labels the account without fabricating a name", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...session, user: { ...userProfile, display_name: "", email: null, picture_url: null } })));
  render(<App initialEntries={["/profile"]} />);
  expect(await screen.findByRole("heading", { name: "Cuenta de Google" })).toBeVisible();
  expect(screen.getByText("Sesión iniciada con Google")).toBeVisible();
  expect(screen.queryByText("Ash Ketchum")).not.toBeInTheDocument();
  expect(screen.queryByText("ash@example.test")).not.toBeInTheDocument();
});
