// Original 8x11 pixel-art trainers for PokéVault (Unova Noir). No third-party assets, no licence needed.
// Same drawing style as the Profile design (docs/design/Profile.dc.html): SVG viewBox "0 0 8 11" with shape-rendering="crispEdges".
// Letters in `rows` map to `palette`; "." is transparent.

export type TrainerId = "mateo" | "diego" | "valentina" | "camila";

export interface TrainerSprite {
  id: TrainerId;
  name: string;
  rows: readonly string[]; // 11 rows of 8 chars
  palette: Readonly<Record<string, string>>;
}

export const TRAINER_VIEWBOX = "0 0 8 11";

export const TRAINERS: readonly TrainerSprite[] = [
  {
    id: "mateo",
    name: "Mateo",
    rows: [
      "..HHHH..",
      "..HHHH..",
      "..SSSS..",
      "..SSSS..",
      ".TTTTTT.",
      ".TTTTTT.",
      ".TTTTTT.",
      ".PPPPPP.",
      ".PPPPPP.",
      ".BB..BB.",
      ".BB..BB.",
    ],
    palette: { H: "#2A323C", S: "#E8C3A0", T: "#F2F5F7", P: "#2A323C", B: "#3FD0E0" },
  },
  {
    id: "diego",
    name: "Diego",
    rows: [
      "..CCCC..",
      ".CCCCCC.",
      "..SSSS..",
      "..SSSS..",
      ".JJJJJJ.",
      ".JJJJJJ.",
      ".JJJJJJ.",
      ".PPPPPP.",
      ".PPPPPP.",
      ".BB..BB.",
      ".BB..BB.",
    ],
    palette: { C: "#7C5CFF", S: "#B9825A", J: "#3FD0E0", P: "#2A323C", B: "#F2F5F7" },
  },
  {
    id: "valentina",
    name: "Valentina",
    rows: [
      "..HHHH..",
      ".HHHHHH.",
      ".HSSSSH.",
      ".HSSSSH.",
      ".HTTTTH.",
      "..TTTT..",
      ".TTTTTT.",
      ".TTTTTT.",
      "..SS.SS.",
      "..BB.BB.",
      "..BB.BB.",
    ],
    palette: { H: "#6B3E26", S: "#E8C3A0", T: "#3FD0E0", B: "#F2F5F7" },
  },
  {
    id: "camila",
    name: "Camila",
    rows: [
      ".HHHHH..",
      "HHHHHHH.",
      ".HSSSSH.",
      "..SSSS.H",
      "..SSSS.H",
      ".TTTTTT.",
      ".TTTTTT.",
      ".PPPPPP.",
      ".PPPPPP.",
      ".SS..SS.",
      ".BB..BB.",
    ],
    palette: { H: "#C8553D", S: "#B9825A", T: "#7C5CFF", P: "#2A323C", B: "#F2F5F7" },
  },
] as const;

export const DEFAULT_TRAINER_ID: TrainerId = "mateo";

export function isTrainerId(value: string): value is TrainerId {
  return TRAINERS.some((t) => t.id === value);
}

/** Merge horizontal runs of the same colour into rects (small SVG, no gaps). */
export function trainerRects(sprite: TrainerSprite): { x: number; y: number; w: number; fill: string }[] {
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === ".") {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      rects.push({ x, y, w: end - x, fill: sprite.palette[ch] });
      x = end;
    }
  });
  return rects;
}
