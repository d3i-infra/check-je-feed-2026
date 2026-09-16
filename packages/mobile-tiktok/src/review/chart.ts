import type { Buckets } from "./state";

// The figure above the watch-history table. Built through the DOM like every
// other SVG in this app (the host's CSP is not ours to assume), sized by a
// viewBox so it scales with the card, and coloured from the same two custom
// properties the checkbox uses. No library: sixteen bars do not need one.
const SVG_NS = "http://www.w3.org/2000/svg";
const W = 320, H = 160;
const LEFT = 40, RIGHT = 8, TOP = 8, BOTTOM = 28;
const PLOT_W = W - LEFT - RIGHT, PLOT_H = H - TOP - BOTTOM;
const MAX_X_LABELS = 6;
// Above this many buckets a bar chart is unreadable and the DOM cost is not
// worth it (a multi-year daily-shaped history could otherwise ask for
// thousands of <rect> elements); draw only the axes and the span instead.
const MAX_BARS = 400;

function node(tag: string, attrs: { [k: string]: string }): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function textNode(x: number, y: number, cls: string, content: string, anchor: string): SVGElement {
  const e = node("text", { x: String(x), y: String(y), "class": cls, "text-anchor": anchor });
  e.textContent = content;
  return e;
}

// 1, 2, 5 times a power of ten, at or above n / 2, so the top tick covers max.
function niceStep(max: number): number {
  const raw = max / 2;
  const pow = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  const m = raw / pow;
  const f = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return Math.max(1, f * pow);
}

// `title` is no longer read here: the SVG is aria-hidden (the h3 above it
// names the figure), but the parameter stays so call sites read the same as
// buildChart(buckets, title, yLabel) everywhere else.
export function buildChart(b: Buckets, _title: string, yLabel: string): SVGElement {
  // aria-hidden: the h3 above the figure already names it and the table
  // beside it carries the data, so the SVG itself is decorative to a screen
  // reader rather than a second, redundant announcement.
  const svg = node("svg", {
    viewBox: "0 0 " + W + " " + H,
    "class": "w-full h-40 block",
    preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true",
  });
  const n = b.keys.length;

  // Above MAX_BARS a bar per bucket is unreadable and costly to build; draw
  // only the axes and the span the buckets cover.
  if (n > MAX_BARS) {
    svg.appendChild(node("line", { x1: String(LEFT), x2: String(W - RIGHT), y1: String(TOP + PLOT_H), y2: String(TOP + PLOT_H), "class": "mt-grid" }));
    svg.appendChild(node("line", { x1: String(LEFT), x2: String(LEFT), y1: String(TOP), y2: String(TOP + PLOT_H), "class": "mt-grid" }));
    svg.appendChild(textNode(W / 2, H - BOTTOM + 14, "mt-xlabel", b.keys[0] + " … " + b.keys[n - 1], "middle"));
    return svg;
  }

  let max = 0;
  for (let i = 0; i < n; i++) if (b.counts[i] > max) max = b.counts[i];
  const step = max > 0 ? niceStep(max) : 1;
  const top = max > 0 ? step * 2 : 1;

  // Y axis: 0, step, 2*step.
  for (let t = 0; t <= 2; t++) {
    const v = t * step;
    const y = TOP + PLOT_H - (v / top) * PLOT_H;
    svg.appendChild(node("line", { x1: String(LEFT), x2: String(W - RIGHT), y1: String(y), y2: String(y), "class": "mt-grid" }));
    svg.appendChild(textNode(LEFT - 4, y + 3, "mt-ylabel", String(v), "end"));
  }
  svg.appendChild(textNode(LEFT, TOP - 1, "mt-ytitle", yLabel, "start"));

  // Bars.
  const slot = PLOT_W / n;
  const barW = Math.max(1, slot * 0.7);
  for (let i = 0; i < n; i++) {
    const h = max > 0 ? (b.counts[i] / top) * PLOT_H : 0;
    svg.appendChild(node("rect", {
      x: String(LEFT + i * slot + (slot - barW) / 2), y: String(TOP + PLOT_H - h),
      width: String(barW), height: String(h), "class": "mt-bar",
    }));
  }

  // X labels: first, last, evenly spaced in between, at most MAX_X_LABELS.
  const every = Math.max(1, Math.ceil((n - 1) / (MAX_X_LABELS - 1)));
  for (let i = 0; i < n; i++) {
    const isEdge = i === 0 || i === n - 1;
    if (!isEdge && (i % every !== 0 || n - 1 - i < every)) continue;
    const x = LEFT + i * slot + slot / 2;
    const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
    svg.appendChild(textNode(x, H - BOTTOM + 14, "mt-xlabel", b.keys[i], anchor));
  }
  return svg;
}
