import { DEFAULT_TRAINER_ID, isTrainerId, type TrainerId } from "../components/profile/trainers";
import { NATIONAL_DEX_TOTAL } from "./pokemon";
import { isDay } from "./history";

/** The trainer sprite and team of the signed-in account (Iteration 10). */
export const TEAM_MAX = 5;
export type Profile = { trainer_id: TrainerId; team: number[]; member_since: string };
export type ProfileUpdate = Pick<Profile, "trainer_id" | "team">;
export class ProfileError extends Error {
  constructor(public readonly status: number) { super("Profile request failed"); }
}

const url = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1/me/profile`;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** At most 5 different national numbers, each from 1 to 1025. */
export function isTeam(v: unknown): v is number[] {
  return Array.isArray(v) && v.length <= TEAM_MAX && new Set(v).size === v.length
    && v.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= NATIONAL_DEX_TOTAL);
}

function parse(v: unknown): Profile {
  if (!record(v) || Object.keys(v).length !== 3 || typeof v.trainer_id !== "string" || !isTrainerId(v.trainer_id) || !isTeam(v.team) || !isDay(v.member_since)) throw new ProfileError(0);
  return { trainer_id: v.trainer_id, team: v.team, member_since: v.member_since };
}

async function call(signal: AbortSignal, body?: ProfileUpdate, csrf?: string): Promise<Profile> {
  const response = await fetch(url, { method: body ? "PUT" : "GET", credentials: "include", cache: "no-store", signal,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json", "X-CSRF-Token": csrf ?? "" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new ProfileError(response.status);
  return parse(await response.json());
}

export const fetchProfile = (signal: AbortSignal) => call(signal);
export function saveProfile(update: ProfileUpdate, csrf: string, signal: AbortSignal): Promise<Profile> {
  if (!isTrainerId(update.trainer_id) || !isTeam(update.team)) throw new ProfileError(422);
  return call(signal, update, csrf);
}
export const defaultProfile = (since: string): Profile => ({ trainer_id: DEFAULT_TRAINER_ID, team: [], member_since: since });
