import { Navigate, useSearchParams } from "react-router-dom";
import { parsePokemonNumber } from "../services/cards";

/**
 * The PC boxes were retired in 8C.1. Old links keep working:
 * `?mode=personal` goes to the binders, `?pokemon=N` (1–1025) to that species' gallery,
 * and anything else to the Pokédex. Other old parameters (`box`, `wallpaper`) are dropped.
 */
export function BoxesRedirect() {
  const [params] = useSearchParams();
  if (params.get("mode") === "personal") return <Navigate to="/binders" replace />;
  const species = params.getAll("pokemon");
  const number = species.length === 1 ? parsePokemonNumber(species[0]) : undefined;
  if (number !== undefined) return <Navigate to={`/pokemon/${number}/cards?returnTo=%2Fpokedex`} replace />;
  return <Navigate to="/pokedex" replace />;
}
