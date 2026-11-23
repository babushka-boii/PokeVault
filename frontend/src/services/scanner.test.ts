import { afterEach, expect, test, vi } from "vitest";
import { fetchScanCapabilities, matchScan, recognizeScan, ScanError } from "./scanner";
import { recognizeResult, scanCapabilities, scanClues, scanResult } from "../test/scannerFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());

test("reads private OCR capabilities without caching", async () => {
  const request = vi.fn().mockResolvedValue(json(scanCapabilities)); vi.stubGlobal("fetch", request);
  expect(await fetchScanCapabilities(new AbortController().signal)).toMatchObject({ available: true, formats: ["image/jpeg", "image/png", "image/webp"] });
  expect(request.mock.calls[0][0]).toContain("/api/v1/scans/capabilities");
  expect(request.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
});

test("accepts advertised native iPhone decoding alongside the existing image formats", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...scanCapabilities, formats: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] })));
  expect((await fetchScanCapabilities(new AbortController().signal)).formats).toContain("image/heic");
});

test.each([["IPHONE.HEIC", "", "image/heic"], ["card.heif", "application/octet-stream", "image/heif"]])("sends original %s bytes with a known extension as the missing media-type hint", async (name, type, expectedType) => {
  const request = vi.fn().mockResolvedValue(json(recognizeResult)); vi.stubGlobal("fetch", request);
  const file = new File(["original bytes"], name, { type });
  await recognizeScan(file, "es", "token", new AbortController().signal);
  expect(request.mock.calls[0][1].body).toBe(file); expect(request.mock.calls[0][1].headers["Content-Type"]).toBe(expectedType);
});

test("rejects explicitly unsupported file types instead of disguising them using the filename", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await expect(recognizeScan(new File(["not an image"], "photo.heic", { type: "text/html" }), "es", "token", new AbortController().signal)).rejects.toMatchObject({ status: 415 });
  expect(request).not.toHaveBeenCalled();
});

test("sends the original image as a bounded raw body with language and CSRF", async () => {
  const request = vi.fn().mockResolvedValue(json(recognizeResult)); vi.stubGlobal("fetch", request);
  const photo = new File(["jpeg bytes"], "card.jpg", { type: "image/jpeg" });
  const signal = new AbortController().signal;
  expect((await recognizeScan(photo, "es", "token", signal)).candidates[0].card.id).toBe("sm9-33");
  expect(request.mock.calls[0][0]).toContain("/recognize?language=es");
  expect(request.mock.calls[0][1]).toMatchObject({ method: "POST", body: photo, signal, credentials: "include", cache: "no-store",
    headers: { "Content-Type": "image/jpeg", "X-CSRF-Token": "token" } });
});

test("matches edited clues as JSON and keeps unknown warning codes safe for the UI", async () => {
  const request = vi.fn().mockResolvedValue(json({ ...scanResult, warnings: ["future_notice"] })); vi.stubGlobal("fetch", request);
  expect(await matchScan(scanClues, "en", "token", new AbortController().signal)).toMatchObject({ warnings: ["future_notice"] });
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ clues: scanClues, language: "en" });
  expect(request.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include", cache: "no-store", headers: { "X-CSRF-Token": "token" } });
});

test("accepts combined verified text and visual evidence from recognition", async () => {
  const evidence = ["name_exact", "name_similar", "number_exact", "set_exact", "printed_total", "visual_features"];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...recognizeResult, candidates: [{ ...scanResult.candidates[0], evidence }], warnings: ["card_rectified", "visual_ambiguous"] })));
  const result = await recognizeScan(new File(["image"], "photo.jpg", { type: "image/jpeg" }), "es", "token", new AbortController().signal);
  expect(result.candidates[0].evidence).toContain("visual_features"); expect(result.warnings).toEqual(["card_rectified", "visual_ambiguous"]);
});

test.each([
  { ...scanResult, candidates: Array(9).fill(scanResult.candidates[0]) },
  { ...scanResult, candidates: [scanResult.candidates[0], scanResult.candidates[0]] },
  { ...scanResult, candidates: [{ ...scanResult.candidates[0], card: { ...scanResult.candidates[0].card, image_sources: [{ base_url: "https://evil.example/photo", language: "en" }] } }] },
  { ...scanResult, candidates: [{ ...scanResult.candidates[0], evidence: ["invented"] }] },
  { ...scanResult, clues: { ...scanClues, printed_total: 2001 } },
  { ...scanResult, status: "no_match" },
])("rejects untrusted candidate identities, assets and inconsistent envelopes", async (payload) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(payload)));
  await expect(matchScan(scanClues, "es", "token", new AbortController().signal)).rejects.toMatchObject({ status: 0 });
});

test.each([[413, "upload_too_large"], [415, "unsupported_image"], [429, "scanner_busy"], [503, "ocr_unavailable"], [504, "ocr_timeout"]])("preserves safe scanner status %s without exposing server messages", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: code, debug: "/private/path" }, status as number)));
  await expect(fetchScanCapabilities(new AbortController().signal)).rejects.toMatchObject({ status, code });
});

test("withholds recognition without a CSRF token", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await expect(matchScan(scanClues, "es", "", new AbortController().signal)).rejects.toBeInstanceOf(ScanError);
  expect(request).not.toHaveBeenCalled();
});
