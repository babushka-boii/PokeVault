import { TRAINER_VIEWBOX, TRAINERS, trainerRects, type TrainerId } from "./trainers";

/** An original pixel-art trainer drawn as crisp SVG rectangles (no image files). */
export function TrainerSprite({ id, width, height, label }: { id: TrainerId; width: number; height: number; label?: string }) {
  const sprite = TRAINERS.find((trainer) => trainer.id === id) ?? TRAINERS[0];
  return <svg width={width} height={height} viewBox={TRAINER_VIEWBOX} shapeRendering="crispEdges" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {trainerRects(sprite).map((rect) => <rect key={`${rect.x}-${rect.y}`} x={rect.x} y={rect.y} width={rect.w} height={1} fill={rect.fill} />)}
  </svg>;
}
