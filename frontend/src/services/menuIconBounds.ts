export type IconBounds = {
  canvasWidth: number;
  canvasHeight: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

// Geometry only: do not retain canvases, pixel buffers, or a rendered animation.
const cache = new Map<string, IconBounds | undefined>();

export function getAlphaBounds(data: Uint8ClampedArray, width: number, height: number): IconBounds | undefined {
  if (width <= 0 || height <= 0 || data.length !== width * height * 4) return;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return;
  return { canvasWidth: width, canvasHeight: height, left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Inspect once on load; the original <img> keeps decoding/playing its APNG. */
export function measureMenuIcon(image: HTMLImageElement): IconBounds | undefined {
  const key = image.currentSrc || image.src;
  if (cache.has(key)) return cache.get(key);
  if (!image.naturalWidth || !image.naturalHeight) return;
  let bounds: IconBounds | undefined;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context) {
      context.drawImage(image, 0, 0);
      bounds = getAlphaBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    }
  } catch { /* Pixel inspection may be unavailable; retain ordinary contain rendering. */ }
  cache.set(key, bounds);
  if (cache.size > 256) cache.delete(cache.keys().next().value!);
  return bounds;
}
