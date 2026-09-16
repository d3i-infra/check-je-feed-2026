import { buildChart } from "./chart";

const months = { unit: "month" as const, keys: ["2026-01", "2026-02", "2026-03", "2026-04"], counts: [10, 0, 25, 5] };

test("one bar per bucket, the tallest bar is the maximum, zero counts draw nothing", () => {
  const svg = buildChart(months, "Videos watched over time", "Number of videos");
  expect(svg.getAttribute("viewBox")).toBe("0 0 320 160");
  expect(svg.getAttribute("role")).toBe("img");
  expect(svg.getAttribute("aria-label")).toBe("Videos watched over time");
  const bars = svg.querySelectorAll("rect.mt-bar");
  expect(bars.length).toBe(4);
  const heights = Array.prototype.map.call(bars, (r: Element) => Number(r.getAttribute("height"))) as number[];
  expect(heights[1]).toBe(0);
  expect(Math.max.apply(null, heights)).toBe(heights[2]);
  expect(svg.querySelector("div")).toBeNull();
});

test("x labels are the first, the last and at most six in total", () => {
  const keys: string[] = []; const counts: number[] = [];
  for (let i = 0; i < 16; i++) { keys.push("2025-" + (i < 9 ? "0" + (i + 1) : String(i + 1))); counts.push(i); }
  const svg = buildChart({ unit: "month", keys, counts }, "t", "y");
  const labels = Array.prototype.map.call(svg.querySelectorAll("text.mt-xlabel"), (t: Element) => t.textContent) as string[];
  expect(labels.length).toBeLessThanOrEqual(6);
  expect(labels[0]).toBe(keys[0]);
  expect(labels[labels.length - 1]).toBe(keys[15]);
});

test("y ticks are rounded and the top tick covers the maximum", () => {
  const svg = buildChart({ unit: "week", keys: ["2026-03-02", "2026-03-09"], counts: [7372, 12] }, "t", "y");
  const ticks = Array.prototype.map.call(svg.querySelectorAll("text.mt-ylabel"), (t: Element) => Number(t.textContent)) as number[];
  expect(ticks.length).toBeLessThanOrEqual(3);
  expect(Math.max.apply(null, ticks)).toBeGreaterThanOrEqual(7372);
});

test("a max of one still steps by whole numbers, not a fractional half", () => {
  const svg = buildChart({ unit: "month", keys: ["2026-01"], counts: [1] }, "t", "y");
  const labels = Array.prototype.map.call(svg.querySelectorAll("text.mt-ylabel"), (t: Element) => t.textContent) as string[];
  expect(labels).toEqual(["0", "1", "2"]);
});
