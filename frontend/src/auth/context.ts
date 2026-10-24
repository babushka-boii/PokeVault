import { createContext, useContext } from "react";
import type { AuthState } from "./store";

type AuthContextValue = AuthState & { retrySession: () => void; logout: () => void };
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
