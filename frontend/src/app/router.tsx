import { Route, Routes } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { BoxesPage } from "../pages/BoxesPage";
import { HomePage } from "../pages/HomePage";
import { PokedexPage } from "../pages/PokedexPage";
import { ProfilePage } from "../pages/ProfilePage";
import { PokemonCardsPage } from "../pages/PokemonCardsPage";
import { TcgCardPage } from "../pages/TcgCardPage";


export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="boxes" element={<BoxesPage />} />
        <Route path="pokedex" element={<PokedexPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="pokemon/:number/cards" element={<PokemonCardsPage />} />
        <Route path="cards/:id" element={<TcgCardPage />} />
      </Route>
    </Routes>
  );
}
