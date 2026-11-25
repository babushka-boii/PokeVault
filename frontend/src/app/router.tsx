import { Route, Routes } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { CollectionPage } from "../pages/CollectionPage";
import { InventoryCopyPage } from "../pages/InventoryCopyPage";
import { BoxesRedirect } from "../pages/BoxesRedirect";
import { BinderPage } from "../pages/BinderPage";
import { BindersPage } from "../pages/BindersPage";
import { LoginPage } from "../pages/LoginPage";
import { HomePage } from "../pages/HomePage";
import { PokedexPage } from "../pages/PokedexPage";
import { ProfilePage } from "../pages/ProfilePage";
import { SpeciesGalleryRedirect, SpeciesPage } from "../pages/SpeciesPage";
import { TcgCardPage } from "../pages/TcgCardPage";
import { SetsPage } from "../pages/SetsPage";
import { SetPage } from "../pages/SetPage";
import { ScannerPage } from "../pages/ScannerPage";


export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="boxes" element={<BoxesRedirect />} />
        <Route path="binders" element={<BindersPage />} />
        <Route path="binders/:binderId" element={<BinderPage />} />
        <Route path="pokedex" element={<PokedexPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="collection" element={<CollectionPage />} />
        <Route path="collection/:copyId" element={<InventoryCopyPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="pokemon/:number" element={<SpeciesPage />} />
        <Route path="pokemon/:number/cards" element={<SpeciesGalleryRedirect />} />
        <Route path="cards/:id" element={<TcgCardPage />} />
        <Route path="sets" element={<SetsPage />} />
        <Route path="sets/:setId" element={<SetPage />} />
        <Route path="scanner" element={<ScannerPage />} />
      </Route>
    </Routes>
  );
}
