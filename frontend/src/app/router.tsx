import { Route, Routes } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { CollectionPage } from "../pages/CollectionPage";
import { InventoryCopyPage } from "../pages/InventoryCopyPage";
import { BoxesPage } from "../pages/BoxesPage";
import { LoginPage } from "../pages/LoginPage";
import { HomePage } from "../pages/HomePage";
import { PokedexPage } from "../pages/PokedexPage";
import { ProfilePage } from "../pages/ProfilePage";
import { PokemonCardsPage } from "../pages/PokemonCardsPage";
import { TcgCardPage } from "../pages/TcgCardPage";
import { SetsPage } from "../pages/SetsPage";
import { SetPage } from "../pages/SetPage";


export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="boxes" element={<BoxesPage />} />
        <Route path="pokedex" element={<PokedexPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="collection" element={<CollectionPage />} />
        <Route path="collection/:copyId" element={<InventoryCopyPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="pokemon/:number/cards" element={<PokemonCardsPage />} />
        <Route path="cards/:id" element={<TcgCardPage />} />
        <Route path="sets" element={<SetsPage />} />
        <Route path="sets/:setId" element={<SetPage />} />
      </Route>
    </Routes>
  );
}
