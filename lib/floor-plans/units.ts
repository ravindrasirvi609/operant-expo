/**
 * The floor-plan coordinate system.
 *
 * Hall dimensions are recorded in metres. The plan canvas is a separate integer coordinate space
 * ("plan units") because element geometry is stored as integers and rendered as CSS pixels — a
 * canvas measured directly in metres would give a 40 m hall a 40x25 canvas, on which a 3 m stall
 * is 3 units wide and unusable to drag.
 *
 * Nothing previously connected the two: halls carried width/height while the plan hardcoded a
 * 1600x2200 default, so the numbers on either side meant nothing to each other. Fixing the ratio
 * here makes hall size, canvas size and stall size mutually consistent, and lets the editor label
 * its axes in metres while storing units.
 */
export const PLAN_UNITS_PER_METRE = 20;

/** Matches the ceiling on canvas dimensions in `floorPlanSchema`. */
export const MAX_CANVAS_UNITS = 100_000;
export const MIN_CANVAS_UNITS = 100;

export function metresToUnits(metres: number) {
  return Math.round(metres * PLAN_UNITS_PER_METRE);
}

export function unitsToMetres(units: number) {
  return units / PLAN_UNITS_PER_METRE;
}

/** Formats a unit measurement for display, e.g. 60 -> "3 m", 70 -> "3.5 m". */
export function formatMetres(units: number, { withUnit = true }: { withUnit?: boolean } = {}) {
  const metres = unitsToMetres(units);
  // Two decimals is finer than any real stall is specified to; trailing zeros are noise.
  const text = Number(metres.toFixed(2)).toString();
  return withUnit ? `${text} m` : text;
}

export function formatArea(widthUnits: number, heightUnits: number) {
  const area = unitsToMetres(widthUnits) * unitsToMetres(heightUnits);
  return `${Number(area.toFixed(2)).toString()} m²`;
}

function clampCanvas(units: number) {
  return Math.min(MAX_CANVAS_UNITS, Math.max(MIN_CANVAS_UNITS, units));
}

/**
 * Default canvas for a hall, derived from its real dimensions.
 *
 * A 40 m x 25 m hall becomes an 800 x 500 canvas, so a stall drawn 60 x 60 reads as 3 m x 3 m.
 */
export function canvasSizeForHall(hall: { width: number; height: number }) {
  return {
    canvasWidth: clampCanvas(metresToUnits(hall.width)),
    canvasHeight: clampCanvas(metresToUnits(hall.height)),
  };
}

/** Grid pitch options offered in the editor, expressed in metres. */
export const GRID_PRESETS = [
  { units: metresToUnits(0.5), label: "0.5 m" },
  { units: metresToUnits(1), label: "1 m" },
  { units: metresToUnits(2), label: "2 m" },
] as const;

export const DEFAULT_GRID_SIZE = metresToUnits(1);
