import { useCallback, useState } from "react";
import { useAuth } from "../auth/context";
import { fetchProfile, ProfileError, saveProfile, type Profile, type ProfileUpdate } from "../services/profile";
import { useTcgResource } from "./useTcgResource";

/** The account's trainer and team. Saving changes what is shown only once the server confirms it. */
export function useProfile(userId: string) {
  const { retrySession, getCsrfToken } = useAuth();
  const request = useCallback((signal: AbortSignal) => fetchProfile(signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof ProfileError && error.status === 401) retrySession();
    throw error;
  }), [retrySession]);
  const resource = useTcgResource(`profile:${userId}`, request);
  const [saved, setSaved] = useState<{ userId: string; profile: Profile }>();
  const profile: Profile | null = saved?.userId === userId ? saved.profile : resource.state.kind === "loaded" ? resource.state.data : null;
  const save = useCallback(async (update: ProfileUpdate): Promise<boolean> => {
    const csrf = getCsrfToken();
    if (!csrf) { retrySession(); return false; }
    try {
      const next = await saveProfile(update, csrf, new AbortController().signal);
      setSaved({ userId, profile: next });
      return true;
    } catch (error: unknown) {
      if (error instanceof ProfileError && error.status === 401) retrySession();
      return false;
    }
  }, [getCsrfToken, retrySession, userId]);
  return { profile, failed: resource.state.kind === "error" && profile === null, retry: resource.retry, save };
}
