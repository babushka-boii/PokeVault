import { Route, Routes } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { BoxesPage } from "../pages/BoxesPage";
import { HomePage } from "../pages/HomePage";
import { PokedexPage } from "../pages/PokedexPage";
import { ProfilePage } from "../pages/ProfilePage";


export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="boxes" element={<BoxesPage />} />
        <Route path="pokedex" element={<PokedexPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}
