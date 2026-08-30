import { metresToUnits } from "@/lib/floor-plans/units";

export type Rect = { x: number; y: number; width: number; height: number; rotation?: number };
export type Canvas = { canvasWidth: number; canvasHeight: number };

export function snapToGrid(value: number, gridSize: number) {
  if (gridSize <= 0) return Math.round(value);
  return Math.round(value / gridSize) * gridSize;
}

/** True when the rectangle lies wholly inside the canvas. */
export function fitsInCanvas(rect: Rect, canvas: Canvas) {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= canvas.canvasWidth &&
    rect.y + rect.height <= canvas.canvasHeight
  );
}

/** Moves a rectangle to the nearest position that fits, preserving its size. */
export function clampToCanvas(rect: Rect, canvas: Canvas): Rect {
  return {
    ...rect,
    x: Math.max(0, Math.min(canvas.canvasWidth - rect.width, rect.x)),
    y: Math.max(0, Math.min(canvas.canvasHeight - rect.height, rect.y)),
  };
}

/**
 * Axis-aligned overlap test. Rectangles that merely share an edge do not overlap — stalls in a row
 * are normally placed flush against their neighbours, and reporting that as a collision would make
 * the checker useless.
 */
export function rectsOverlap(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

/**
 * Every overlapping pair among the given rectangles, as index pairs.
 *
 * Sorting by left edge lets the scan stop early: once a candidate starts at or beyond the current
 * rectangle's right edge, no later candidate can overlap it either. That keeps a few hundred
 * stalls comfortable to check on every edit, where the naive all-pairs comparison would not be.
 */
export function findOverlappingPairs<T extends Rect>(rects: T[]): Array<[number, number]> {
  const order = rects.map((rect, index) => ({ rect, index })).sort((a, b) => a.rect.x - b.rect.x);
  const pairs: Array<[number, number]> = [];

  for (let i = 0; i < order.length; i += 1) {
    const current = order[i];
    for (let j = i + 1; j < order.length; j += 1) {
      const candidate = order[j];
      if (candidate.rect.x >= current.rect.x + current.rect.width) break;
      if (rectsOverlap(current.rect, candidate.rect)) {
        pairs.push(
          current.index < candidate.index
            ? [current.index, candidate.index]
            : [candidate.index, current.index],
        );
      }
    }
  }

  return pairs;
}

/* ---------------------------------------------------------------------------
   Stall numbering
   --------------------------------------------------------------------------- */

export const NUMBERING_SCHEMES = ["ROW_LETTER", "SEQUENTIAL"] as const;
export type NumberingScheme = (typeof NUMBERING_SCHEMES)[number];

/** Spreadsheet-style column name, so a 27-row block continues A, B … Z, AA rather than repeating. */
export function rowLabel(rowIndex: number) {
  let label = "";
  let remaining = rowIndex;
  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return label;
}

export function stallNumberAt(
  rowIndex: number,
  columnIndex: number,
  columns: number,
  { scheme, prefix = "", start = 1 }: { scheme: NumberingScheme; prefix?: string; start?: number },
) {
  if (scheme === "SEQUENTIAL") {
    return `${prefix}${start + rowIndex * columns + columnIndex}`;
  }
  return `${prefix}${rowLabel(rowIndex)}-${start + columnIndex}`;
}

/**
 * Next free stall number following the pattern of an existing one, for the single "add stall"
 * action. Splits a trailing integer off the label and increments it until the result is unused,
 * so "A-12" suggests "A-13" and "S7" suggests "S8".
 */
export function nextStallNumber(existing: string[], template = "A-1") {
  const taken = new Set(existing);
  const match = /^(.*?)(\d+)$/.exec(template);
  const prefix = match ? match[1] : `${template}-`;
  let counter = match ? Number(match[2]) : 1;

  // Bounded so a pathological inventory cannot spin here; 10k stalls is far beyond one hall.
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const candidate = `${prefix}${counter}`;
    if (!taken.has(candidate)) return candidate;
    counter += 1;
  }
  return `${prefix}${Date.now()}`;
}

/* ---------------------------------------------------------------------------
   Bulk grid generation — the main lever for laying out a hall quickly
   --------------------------------------------------------------------------- */

export type GridRequest = {
  rows: number;
  columns: number;
  /** Stall footprint, in plan units. */
  stallWidth: number;
  stallHeight: number;
  /** Aisle between stalls, in plan units. */
  gapX: number;
  gapY: number;
  originX: number;
  originY: number;
  scheme: NumberingScheme;
  prefix?: string;
  start?: number;
};

export type GeneratedStall = { stallNumber: string; section: string; geometry: Rect };

/** Total footprint a request would occupy, for validating it against the canvas up front. */
export function gridFootprint(request: GridRequest) {
  return {
    width: request.columns * request.stallWidth + Math.max(0, request.columns - 1) * request.gapX,
    height: request.rows * request.stallHeight + Math.max(0, request.rows - 1) * request.gapY,
  };
}

export function generateGrid(request: GridRequest): GeneratedStall[] {
  const stalls: GeneratedStall[] = [];

  for (let row = 0; row < request.rows; row += 1) {
    for (let column = 0; column < request.columns; column += 1) {
      stalls.push({
        stallNumber: stallNumberAt(row, column, request.columns, {
          scheme: request.scheme,
          prefix: request.prefix,
          start: request.start,
        }),
        section: rowLabel(row),
        geometry: {
          x: request.originX + column * (request.stallWidth + request.gapX),
          y: request.originY + row * (request.stallHeight + request.gapY),
          width: request.stallWidth,
          height: request.stallHeight,
        },
      });
    }
  }

  return stalls;
}

/** Sensible starting point for the grid dialog: 3 m stalls with a 2 m aisle. */
export const DEFAULT_GRID_REQUEST = {
  rows: 3,
  columns: 6,
  stallWidth: metresToUnits(3),
  stallHeight: metresToUnits(3),
  gapX: 0,
  gapY: metresToUnits(2),
  originX: metresToUnits(1),
  originY: metresToUnits(1),
  scheme: "ROW_LETTER" as NumberingScheme,
  start: 1,
} satisfies GridRequest;
