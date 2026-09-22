/**
 * Where a territory's mark belongs: the point furthest inside the shape a
 * reader sees, rather than the middle of the box around it. Gyeonggi's
 * territories wrap around their neighbours and Incheon reaches out to islands
 * near the northern limit, so a box centre landed in the sea or on someone
 * else's ground.
 *
 * This is the pole of inaccessibility, found the way mapshaper's polylabel
 * does: quarter the shape's box, keep the cell that could still hold a point
 * further from the edge than the best one found so far, and stop once the
 * remainder cannot beat it by more than a degree's worth of precision.
 */

type Ring = readonly (readonly number[])[];
type Polygon = readonly Ring[];

export interface Centre {
  longitude: number;
  latitude: number;
}

interface Cell {
  x: number;
  y: number;
  half: number;
  distance: number;
  potential: number;
}

/** Signed distance from a point to a polygon: positive inside, negative out. */
function signedDistance(x: number, y: number, polygon: Polygon) {
  let inside = false;
  let squared = Infinity;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[j];
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      squared = Math.min(squared, segmentDistanceSquared(x, y, ax, ay, bx, by));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(squared);
}

function segmentDistanceSquared(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  let nearestX = ax;
  let nearestY = ay;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx !== 0 || dy !== 0) {
    const along = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
    if (along > 1) {
      nearestX = bx;
      nearestY = by;
    } else if (along > 0) {
      nearestX = ax + along * dx;
      nearestY = ay + along * dy;
    }
  }
  return (x - nearestX) ** 2 + (y - nearestY) ** 2;
}

function cellAt(x: number, y: number, half: number, polygon: Polygon): Cell {
  const distance = signedDistance(x, y, polygon);
  // The most any point in this cell could manage: its centre's distance plus
  // the reach from centre to corner.
  return { x, y, half, distance, potential: distance + half * Math.SQRT2 };
}

function ringArea(ring: Ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area / 2);
}

function polygonsOf(geometry: { type?: string; coordinates?: unknown }): Polygon[] {
  if (geometry.type === "Polygon") return [geometry.coordinates as Polygon];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Polygon[];
  return [];
}

/**
 * The mark goes on the body of a territory, so a MultiPolygon is represented
 * by its largest piece — the mainland, not an island off it.
 */
function largestPolygon(polygons: readonly Polygon[]) {
  let largest: Polygon | null = null;
  let largestArea = -1;
  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 4) continue;
    const area = ringArea(ring);
    if (area > largestArea) {
      largestArea = area;
      largest = polygon;
    }
  }
  return largest;
}

export function shapeCentre(feature: unknown, precision = 0.002): Centre | null {
  const geometry = (feature as { geometry?: { type?: string; coordinates?: unknown } })?.geometry;
  if (!geometry) return null;
  const polygon = largestPolygon(polygonsOf(geometry));
  if (!polygon) return null;

  const outer = polygon[0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) return { longitude: minX, latitude: minY };

  const size = Math.min(width, height);
  let best = cellAt(minX + width / 2, minY + height / 2, 0, polygon);
  // A queue kept in distance order: the most promising cell is split first, so
  // the bound rules the rest out sooner.
  const queue: Cell[] = [];
  const push = (cell: Cell) => {
    let low = 0;
    let high = queue.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (queue[middle].potential > cell.potential) low = middle + 1;
      else high = middle;
    }
    queue.splice(low, 0, cell);
  };

  const half = size / 2;
  for (let x = minX + half; x < maxX + half; x += size) {
    for (let y = minY + half; y < maxY + half; y += size) {
      push(cellAt(Math.min(x, maxX), Math.min(y, maxY), half, polygon));
    }
  }

  // Bounded so a pathological shape cannot spin here: by then the answer is
  // already within a few hundred metres, which no reader can see.
  let visited = 0;
  while (queue.length > 0 && visited < 20000) {
    const cell = queue.shift() as Cell;
    visited += 1;
    if (cell.distance > best.distance) best = cell;
    if (cell.potential - best.distance <= precision) continue;
    const quarter = cell.half / 2;
    push(cellAt(cell.x - quarter, cell.y - quarter, quarter, polygon));
    push(cellAt(cell.x + quarter, cell.y - quarter, quarter, polygon));
    push(cellAt(cell.x - quarter, cell.y + quarter, quarter, polygon));
    push(cellAt(cell.x + quarter, cell.y + quarter, quarter, polygon));
  }

  return { longitude: best.x, latitude: best.y };
}
