"""Conservative single-card framing inside the disposable image worker.

Geometry only identifies a plausible card outline, never a card identity. A
missing, clipped or competing outline retains the entire bounded photograph.
"""

from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from app.scanner.images import NORMALIZED_EDGE

ANALYSIS_EDGE = 1024


@dataclass(frozen=True, slots=True)
class PreparedCard:
    image: Image.Image
    rectified: bool
    warnings: list[str]


def _bounded(image: Image.Image) -> Image.Image:
    result = image.copy()
    result.thumbnail((NORMALIZED_EDGE, NORMALIZED_EDGE), Image.Resampling.LANCZOS)
    result.info.clear()
    return result


def _quad(contour, size: tuple[int, int]):
    perimeter = cv2.arcLength(contour, True)
    polygon = cv2.approxPolyDP(contour, 0.025 * perimeter, True)
    area = abs(cv2.contourArea(polygon))
    width, height = size
    if (
        len(polygon) != 4
        or not cv2.isContourConvex(polygon)
        or not 0.035 * width * height < area < 0.98 * width * height
    ):
        return None
    points = polygon.reshape(4, 2).astype(np.float32)
    # A clipped image edge does not establish a complete card outline.
    if (
        np.any(points < 2)
        or np.any(points[:, 0] > width - 3)
        or np.any(points[:, 1] > height - 3)
    ):
        return None
    center = points.mean(axis=0)
    angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
    points = points[np.argsort(angles)]
    points = np.roll(points, -int(np.argmin(points.sum(axis=1))), axis=0)
    vectors = np.roll(points, -1, axis=0) - points
    lengths = np.linalg.norm(vectors, axis=1)
    sides = np.array([(lengths[0] + lengths[2]) / 2, (lengths[1] + lengths[3]) / 2])
    if (
        min(lengths) < 35
        or not 0.55 < min(sides) / max(sides) < 0.85
        or min(lengths[0], lengths[2]) / max(lengths[0], lengths[2]) < 0.60
        or min(lengths[1], lengths[3]) / max(lengths[1], lengths[3]) < 0.60
    ):
        return None
    cosines = np.sum(vectors * np.roll(vectors, 1, axis=0), axis=1) / (
        lengths * np.roll(lengths, 1)
    )
    if np.max(np.abs(cosines)) > 0.45:
        return None
    if sides[0] > sides[1]:
        points = np.roll(points, -1, axis=0)
        sides = sides[::-1]
    return area, points, sides


def prepare_card(image: Image.Image) -> PreparedCard:
    """Analyze <=1024 pixels/edge, warp from validated source into <=2048/edge."""
    cv2.setNumThreads(1)
    small = image.convert("L")
    small.thumbnail((ANALYSIS_EDGE, ANALYSIS_EDGE), Image.Resampling.LANCZOS)
    pixels = np.asarray(small)
    blurred = cv2.GaussianBlur(pixels, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 120)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    # Restrict Python work even when a high-frequency photograph has many edges.
    candidates = []
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:256]:
        candidate = _quad(contour, small.size)
        if candidate is not None:
            candidates.append(candidate)
    if not candidates:
        # Foil and textured backgrounds can break the perimeter into a concave
        # contour. One smoother, lower-threshold pass recovers its outer hull;
        # the same aspect, clipping, angle and competing-object checks apply.
        edges = cv2.Canny(cv2.GaussianBlur(pixels, (9, 9), 0), 20, 60)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:256]:
            candidate = _quad(cv2.convexHull(contour), small.size)
            if candidate is not None:
                candidates.append(candidate)
    if not candidates:
        return PreparedCard(_bounded(image), False, ["card_boundary_uncertain"])
    candidates.sort(key=lambda candidate: candidate[0], reverse=True)
    area, points, _ = candidates[0]
    for other_area, other_points, _ in candidates[1:]:
        if other_area < area * 0.40:
            continue
        overlap, _ = cv2.intersectConvexConvex(points, other_points)
        if overlap / other_area < 0.80:
            return PreparedCard(_bounded(image), False, ["card_boundary_ambiguous"])

    scale = np.float32([image.width / small.width, image.height / small.height])
    source = points * scale
    lengths = np.linalg.norm(source - np.roll(source, -1, axis=0), axis=1)
    width = max(lengths[0], lengths[2])
    height = max(lengths[1], lengths[3])
    shrink = min(1.0, NORMALIZED_EDGE / max(width, height))
    width, height = max(1, round(width * shrink)), max(1, round(height * shrink))
    destination = np.float32(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]]
    )
    transform = cv2.getPerspectiveTransform(source, destination)
    corrected = cv2.warpPerspective(
        np.asarray(image),
        transform,
        (width, height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return PreparedCard(Image.fromarray(corrected), True, ["card_rectified"])
