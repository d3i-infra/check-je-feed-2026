import { buildChart } from "./chart";

const months = { unit: "month" as const, keys: ["2026-01", "2026-02", "2026-03", "2026-04"], counts: [10, 0, 25, 5] };

test("one bar per bucket, the tallest bar is the maximum, zero counts draw nothing", () => {
  const svg = buildChart(months);
  expect(svg.getAttribute("viewBox")).toBe("0 0 320 160");
  // Decorative: the h3 above the figure names it and the table beside it
  // carries the data, so the SVG itself is hidden from assistive tech rather
  // than announced a second time.
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(svg.getAttribute("role")).toBeNull();
  expect(svg.getAttribute("aria-label")).toBeNull();
  expect(svg.getAttribute("class")).toBe("w-full h-40 block");
  expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  const bars = svg.querySelectorAll("rect.mt-bar");
  expect(bars.length).toBe(4);
  const heights = Array.prototype.map.call(bars, (r: Element) => Number(r.getAttribute("height"))) as number[];
  expect(heights[1]).toBe(0);
  expect(Math.max.apply(null, heights)).toBe(heights[2]);
  expect(svg.querySelector("div")).toBeNull();
});

const CHAR_UNITS = 5.4;

function labelXs(svg: SVGElement): number[] {
  return (Array.prototype.map.call(svg.querySelectorAll("text.mt-xlabel"), (t: Element) => Number(t.getAttribute("x"))) as number[]).sort((a, b) => a - b);
}

test.each([
  ["4 weeks", { unit: "week" as const, keys: ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"], counts: [200, 0, 0, 170] }],
  ["16 months", { unit: "month" as const, keys: Array.from({ length: 16 }, (_, i) => "2025-" + (i < 9 ? "0" + (i + 1) : String(i + 1))), counts: Array.from({ length: 16 }, () => 1) }],
  ["52 weeks", { unit: "week" as const, keys: Array.from({ length: 52 }, (_, i) => "2026-01-" + (i < 9 ? "0" + (i + 1) : String(i + 1))), counts: Array.from({ length: 52 }, () => 1) }],
  // Regressions (fix round 1): the last label is drawn clamped to W - half,
  // so a candidate must be checked against that clamped position, not the
  // last label's unclamped centre, or the two end up closer than a label
  // width apart. 31 months (7-char keys) and 17 weeks (10-char keys) each
  // land a candidate within a label width of the unclamped last centre but
  // not of the clamped one.
  ["31 months", { unit: "month" as const, keys: Array.from({ length: 31 }, (_, i) => String(2025 + Math.floor(i / 12)) + "-" + (i % 12 < 9 ? "0" + (i % 12 + 1) : String(i % 12 + 1))), counts: Array.from({ length: 31 }, () => 1) }],
  ["17 weeks", { unit: "week" as const, keys: Array.from({ length: 17 }, (_, i) => "2026-01-" + (i < 9 ? "0" + (i + 1) : String(i + 1))), counts: Array.from({ length: 17 }, () => 1) }],
])("x labels never overlap and keep the ends: %s", (_name, b) => {
  const svg = buildChart(b);
  const texts = Array.prototype.map.call(svg.querySelectorAll("text.mt-xlabel"), (t: Element) => t.textContent) as string[];
  expect(texts[0]).toBe(b.keys[0]);
  expect(texts[texts.length - 1]).toBe(b.keys[b.keys.length - 1]);
  const xs = labelXs(svg);
  const width = b.keys[0].length * CHAR_UNITS;
  for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(width);
  for (const x of xs) { expect(x - width / 2).toBeGreaterThanOrEqual(0); expect(x + width / 2).toBeLessThanOrEqual(320); }
  expect(svg.querySelectorAll("text.mt-ytitle").length).toBe(0);
});

test("y ticks are rounded and the top tick covers the maximum", () => {
  const svg = buildChart({ unit: "week", keys: ["2026-03-02", "2026-03-09"], counts: [7372, 12] });
  const ticks = Array.prototype.map.call(svg.querySelectorAll("text.mt-ylabel"), (t: Element) => Number(t.textContent)) as number[];
  expect(ticks.length).toBeLessThanOrEqual(3);
  expect(Math.max.apply(null, ticks)).toBeGreaterThanOrEqual(7372);
});

test("a max of one still steps by whole numbers, not a fractional half", () => {
  const svg = buildChart({ unit: "month", keys: ["2026-01"], counts: [1] });
  const labels = Array.prototype.map.call(svg.querySelectorAll("text.mt-ylabel"), (t: Element) => t.textContent) as string[];
  expect(labels).toEqual(["0", "1", "2"]);
});

test("more than 400 buckets draws only the axes and a first-to-last-key label", () => {
  const keys: string[] = []; const counts: number[] = [];
  for (let i = 0; i < 401; i++) { keys.push("2026-01-" + i); counts.push(i); }
  const svg = buildChart({ unit: "week", keys, counts });
  expect(svg.querySelectorAll("rect.mt-bar").length).toBe(0);
  const labels = svg.querySelectorAll("text.mt-xlabel");
  expect(labels.length).toBe(1);
  expect(labels[0].textContent).toBe(keys[0] + " … " + keys[keys.length - 1]);
});
