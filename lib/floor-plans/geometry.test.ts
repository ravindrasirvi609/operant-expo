import { describe, expect, it } from "vitest";

import {
  DEFAULT_GRID_REQUEST,
  clampToCanvas,
  findOverlappingPairs,
  fitsInCanvas,
  generateGrid,
  gridFootprint,
  nextStallNumber,
  rectsOverlap,
  rowLabel,
  snapToGrid,
  stallNumberAt,
} from "@/lib/floor-plans/geometry";
import { canvasSizeForHall, formatArea, formatMetres, metresToUnits } from "@/lib/floor-plans/units";

const canvas = { canvasWidth: 800, canvasHeight: 500 };

describe("units", () => {
  it("derives a canvas from real hall dimensions", () => {
    // A 40 m x 25 m hall at 20 units per metre. Nothing linked these before, so a hall of any
    // size got the same hardcoded 1600x2200 canvas.
    expect(canvasSizeForHall({ width: 40, height: 25 })).toEqual({ canvasWidth: 800, canvasHeight: 500 });
  });

  it("clamps a canvas to the schema's own bounds", () => {
    expect(canvasSizeForHall({ width: 0.1, height: 0.1 }).canvasWidth).toBe(100);
    expect(canvasSizeForHall({ width: 999_999, height: 1 }).canvasWidth).toBe(100_000);
  });

  it("renders units back as metres without trailing noise", () => {
    expect(formatMetres(60)).toBe("3 m");
    expect(formatMetres(70)).toBe("3.5 m");
    expect(formatMetres(metresToUnits(1))).toBe("1 m");
  });

  it("reports area in square metres", () => {
    expect(formatArea(60, 60)).toBe("9 m²");
  });
});

describe("snapToGrid", () => {
  it("snaps to the nearest multiple", () => {
    expect(snapToGrid(23, 20)).toBe(20);
    expect(snapToGrid(31, 20)).toBe(40);
  });

  it("degrades to rounding when snapping is off", () => {
    expect(snapToGrid(23.6, 0)).toBe(24);
  });
});

describe("canvas containment", () => {
  it("accepts a rectangle flush with the far edge", () => {
    expect(fitsInCanvas({ x: 740, y: 440, width: 60, height: 60 }, canvas)).toBe(true);
  });

  it("rejects one that would spill over", () => {
    expect(fitsInCanvas({ x: 780, y: 30, width: 60, height: 60 }, canvas)).toBe(false);
    expect(fitsInCanvas({ x: -1, y: 30, width: 60, height: 60 }, canvas)).toBe(false);
  });

  it("clamps a spilling rectangle without resizing it", () => {
    const clamped = clampToCanvas({ x: 900, y: -20, width: 60, height: 60 }, canvas);
    expect(clamped).toMatchObject({ x: 740, y: 0, width: 60, height: 60 });
  });
});

describe("overlap detection", () => {
  it("treats stalls sharing an edge as adjacent, not overlapping", () => {
    // Stalls in a row are normally placed flush; flagging that would make the check useless.
    expect(rectsOverlap({ x: 0, y: 0, width: 60, height: 60 }, { x: 60, y: 0, width: 60, height: 60 })).toBe(false);
  });

  it("detects a genuine intersection", () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 60, height: 60 }, { x: 30, y: 30, width: 60, height: 60 })).toBe(true);
  });

  it("detects containment", () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(true);
  });

  it("reports overlapping pairs as ascending index pairs", () => {
    const rects = [
      { x: 0, y: 0, width: 60, height: 60 },
      { x: 200, y: 0, width: 60, height: 60 },
      { x: 30, y: 30, width: 60, height: 60 },
    ];
    expect(findOverlappingPairs(rects)) .toEqual([[0, 2]]);
  });

  it("finds nothing in a clean generated grid", () => {
    const grid = generateGrid(DEFAULT_GRID_REQUEST);
    expect(findOverlappingPairs(grid.map((stall) => stall.geometry))).toEqual([]);
  });

  it("finds every pair in a fully stacked set", () => {
    const stacked = Array.from({ length: 4 }, () => ({ x: 10, y: 10, width: 50, height: 50 }));
    expect(findOverlappingPairs(stacked)).toHaveLength(6);
  });
});

describe("row labels", () => {
  it("counts like spreadsheet columns past Z", () => {
    expect(rowLabel(0)).toBe("A");
    expect(rowLabel(25)).toBe("Z");
    expect(rowLabel(26)).toBe("AA");
    expect(rowLabel(27)).toBe("AB");
  });
});

describe("stallNumberAt", () => {
  it("numbers row-letter style", () => {
    expect(stallNumberAt(0, 0, 6, { scheme: "ROW_LETTER" })).toBe("A-1");
    expect(stallNumberAt(1, 3, 6, { scheme: "ROW_LETTER" })).toBe("B-4");
  });

  it("numbers sequentially across rows", () => {
    expect(stallNumberAt(0, 0, 6, { scheme: "SEQUENTIAL" })).toBe("1");
    expect(stallNumberAt(1, 0, 6, { scheme: "SEQUENTIAL" })).toBe("7");
  });

  it("honours a prefix and a starting number", () => {
    expect(stallNumberAt(0, 0, 6, { scheme: "ROW_LETTER", prefix: "H1-", start: 10 })).toBe("H1-A-10");
  });
});

describe("nextStallNumber", () => {
  it("increments the trailing number of the template", () => {
    expect(nextStallNumber(["A-1", "A-2"], "A-2")).toBe("A-3");
  });

  it("skips numbers already taken", () => {
    expect(nextStallNumber(["A-1", "A-2", "A-3"], "A-1")).toBe("A-4");
  });

  it("handles a template with no separator", () => {
    expect(nextStallNumber(["S7"], "S7")).toBe("S8");
  });

  it("appends a counter when the template has no number at all", () => {
    expect(nextStallNumber([], "Stall")).toBe("Stall-1");
  });
});

describe("generateGrid", () => {
  it("produces rows x columns stalls", () => {
    const grid = generateGrid({ ...DEFAULT_GRID_REQUEST, rows: 3, columns: 6 });
    expect(grid).toHaveLength(18);
  });

  it("gives every stall a unique number", () => {
    const grid = generateGrid(DEFAULT_GRID_REQUEST);
    expect(new Set(grid.map((stall) => stall.stallNumber)).size).toBe(grid.length);
  });

  it("lays stalls out left to right, top to bottom, with the requested aisle", () => {
    const grid = generateGrid({
      ...DEFAULT_GRID_REQUEST,
      rows: 2,
      columns: 2,
      stallWidth: 60,
      stallHeight: 60,
      gapX: 0,
      gapY: 40,
      originX: 20,
      originY: 20,
    });

    expect(grid.map((stall) => [stall.stallNumber, stall.geometry.x, stall.geometry.y])).toEqual([
      ["A-1", 20, 20],
      ["A-2", 80, 20],
      ["B-1", 20, 120],
      ["B-2", 80, 120],
    ]);
  });

  it("tags each row with its own section letter", () => {
    const grid = generateGrid({ ...DEFAULT_GRID_REQUEST, rows: 2, columns: 1 });
    expect(grid.map((stall) => stall.section)).toEqual(["A", "B"]);
  });

  it("computes a footprint that matches the generated extent", () => {
    const request = { ...DEFAULT_GRID_REQUEST, rows: 2, columns: 3, stallWidth: 60, stallHeight: 60, gapX: 10, gapY: 20, originX: 0, originY: 0 };
    const footprint = gridFootprint(request);
    const grid = generateGrid(request);

    const right = Math.max(...grid.map((s) => s.geometry.x + s.geometry.width));
    const bottom = Math.max(...grid.map((s) => s.geometry.y + s.geometry.height));
    expect(footprint).toEqual({ width: right, height: bottom });
  });

  it("fits the default request inside a canvas derived from a 40x25 m hall", () => {
    const hallCanvas = canvasSizeForHall({ width: 40, height: 25 });
    for (const stall of generateGrid(DEFAULT_GRID_REQUEST)) {
      expect(fitsInCanvas(stall.geometry, hallCanvas), stall.stallNumber).toBe(true);
    }
  });
});
