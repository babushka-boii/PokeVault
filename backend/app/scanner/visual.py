"""Conservative local artwork evidence, never proof of a particular printing.

The checks are engineering safeguards exercised on procedural controls and two
authorized photos, not calibrated confidence. Shared artwork across printings
must remain ambiguous until independent catalog/text evidence distinguishes it.
"""

from collections import Counter
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

VISUAL_EDGE = 1000
MAX_FEATURES = 1000


@dataclass(frozen=True, slots=True)
class VisualEvidence:
    inliers: int
    support: float


def _pixels(image: Image.Image) -> np.ndarray:
    bounded = image.convert("L")
    bounded.thumbnail((VISUAL_EDGE, VISUAL_EDGE), Image.Resampling.LANCZOS)
    return np.asarray(bounded)


def _plausible_projection(matrix, reference_size, query_size) -> bool:
    height, width = reference_size
    query_height, query_width = query_size
    corners = np.float32([[[0, 0], [width, 0], [width, height], [0, height]]])
    projected = cv2.perspectiveTransform(corners, matrix)[0]
    if not np.isfinite(projected).all() or not cv2.isContourConvex(projected):
        return False
    # Negative signed area is a reflection, not an ordinary view of a card.
    area = cv2.contourArea(projected, oriented=True) / (query_width * query_height)
    if not 0.035 <= area <= 1.2:
        return False
    margin = np.float32([query_width, query_height]) * 0.15
    return bool(
        np.all(projected >= -margin)
        and np.all(projected <= np.float32([query_width, query_height]) + margin)
    )


def compare(query: Image.Image, reference: Image.Image) -> VisualEvidence | None:
    """Match distributed upper-card art using bounded ORB and a single homography.

    Reference features exclude the title, outer frame and lower rules text that
    many unrelated cards share. This intentionally abstains on sparse artwork;
    it does not establish that a photo is a different card. The input images
    must already have passed the worker's decode/security limits.
    """
    query_pixels, reference_pixels = _pixels(query), _pixels(reference)
    height, width = reference_pixels.shape
    if min(height, width, *query_pixels.shape) < 64:
        return None
    mask = np.zeros_like(reference_pixels)
    mask[
        int(height * 0.14) : int(height * 0.65),
        int(width * 0.08) : int(width * 0.92),
    ] = 255
    orb = cv2.ORB_create(nfeatures=MAX_FEATURES)
    reference_points, reference_descriptors = orb.detectAndCompute(
        reference_pixels, mask
    )
    query_points, query_descriptors = orb.detectAndCompute(query_pixels, None)
    if reference_descriptors is None or query_descriptors is None:
        return None
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(
        reference_descriptors, query_descriptors, k=2
    )
    matches = [
        pair[0]
        for pair in pairs
        if len(pair) == 2 and pair[0].distance < 0.72 * pair[1].distance
    ]
    # A repeated query corner cannot supply several independent correspondences.
    unique = {}
    for match in sorted(matches, key=lambda item: item.distance):
        unique.setdefault(match.trainIdx, match)
    matches = list(unique.values())
    if len(matches) < 12:
        return None
    source = np.float32(
        [reference_points[match.queryIdx].pt for match in matches]
    )
    destination = np.float32([query_points[match.trainIdx].pt for match in matches])
    matrix, inlier_mask = cv2.findHomography(
        source,
        destination,
        cv2.RANSAC,
        4.0,
        maxIters=1000,
        confidence=0.995,
    )
    if matrix is None or inlier_mask is None:
        return None
    inliers = inlier_mask.ravel().astype(bool)
    count = int(inliers.sum())
    if count < 12 or count / len(matches) < 0.5:
        return None
    support = cv2.contourArea(cv2.convexHull(source[inliers])) / (width * height)
    cells = Counter(
        (min(2, int(x / width * 3)), min(2, int(y / height * 3)))
        for x, y in source[inliers]
    )
    # An isolated correspondence must not turn a concentrated patch into
    # distributed evidence merely by expanding its convex hull.
    if support < 0.06 or sum(count >= 3 for count in cells.values()) < 3:
        return None
    if not _plausible_projection(matrix, reference_pixels.shape, query_pixels.shape):
        return None
    return VisualEvidence(count, round(float(support), 6))
