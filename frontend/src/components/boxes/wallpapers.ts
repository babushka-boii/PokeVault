export const wallpapers = ["classic", "forest", "ocean", "night"] as const;
export type Wallpaper = typeof wallpapers[number];
