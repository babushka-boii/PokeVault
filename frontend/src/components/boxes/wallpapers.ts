/** "noir" (Unova Noir, Iteration 8A) is the default; the four retro screens stay selectable. */
export const wallpapers = ["noir", "classic", "forest", "ocean", "night"] as const;
export type Wallpaper = typeof wallpapers[number];
export const DEFAULT_WALLPAPER: Wallpaper = "noir";
