import { createContext, useContext } from "react";

export const PreviousRoute = createContext<string | undefined>(undefined);
export function usePreviousRoute() { return useContext(PreviousRoute); }
