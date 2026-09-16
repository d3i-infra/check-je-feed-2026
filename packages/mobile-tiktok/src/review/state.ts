import type { Table } from "../extract";

// Pages of 25, as on the desktop consent screen: a page has to fit on a phone
// screen without the participant losing where they are in it.
export const PAGE_SIZE = 25;

// A bucket key comes from the "YYYY-MM-DD" prefix of a Date cell; anything
// that does not start like a date is left out rather than guessed at.
const DAY_PREFIX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}/;
const MS_PER_DAY = 86400000;
// Histories shorter than this bucket by week; the desktop's own ladder is
// day above 10 days, month above 300, quarter above 900 and year above 3650,
// so the two sides agree only between one year and about two and a half;
// below a year the phone draws weeks where the desktop draws days, above 900
// days months where the desktop draws quarters.
const WEEK_BELOW_DAYS = 365;
// DAY_PREFIX is shape-only and dayNumber's Date.UTC normalises a malformed
// cell (like day 30 of February) rather than rejecting it, so a shape-valid
// but out-of-range year would otherwise build tens of thousands of buckets;
// TikTok exports live well inside this window.
const MIN_DAY = Date.UTC(2000, 0, 1) / MS_PER_DAY;
const MAX_DAY = Date.UTC(2100, 0, 1) / MS_PER_DAY;

export interface Buckets { unit: "month" | "week"; keys: string[]; counts: number[] }

function digit(s: string, i: number): number { return s.charCodeAt(i) - 48; }

// Days since 1970-01-01 for a cell that passed DAY_PREFIX. Reads ten char
// codes; Date.UTC returns a number, so nothing is allocated per row.
function dayNumber(cell: string): number {
  const y = digit(cell, 0) * 1000 + digit(cell, 1) * 100 + digit(cell, 2) * 10 + digit(cell, 3);
  const m = digit(cell, 5) * 10 + digit(cell, 6);
  const d = digit(cell, 8) * 10 + digit(cell, 9);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

// Day 0 (1970-01-01) was a Thursday; the Monday on or before `dn`.
function mondayOf(dn: number): number {
  return dn - ((dn + 3) % 7 + 7) % 7;
}

function pad2(n: number): string { return n < 10 ? "0" + n : String(n); }

function dayKey(dn: number): string {
  const d = new Date(dn * MS_PER_DAY);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}

function monthKey(y: number, m0: number): string { return y + "-" + pad2(m0 + 1); }

export interface TableState {
  table: Table;
  deleted: Uint8Array;
  deletedCount: number;
  selected: Uint8Array;
  selectedCount: number;
  query: string;
  matches: number[] | null;
  page: number;
  // A derived view over the rows, held until a mutation drops it. Every
  // in-place render asks for it several times, and on a 65k-row watch
  // history each rebuild is a full pass over the table.
  visibleCache: number[] | null;
  // One stack per table, as on the desktop. A global stack would let the Undo
  // beside this table's deleted count restore a different table's rows, with
  // nothing on screen changing to say so.
  undoStack: number[][];
  // Cached alongside visibleCache and dropped with it. undefined = not
  // computed yet; null = computed and there was nothing to bucket. The cache
  // holds the result for the last column asked for; bucketsColumn names it.
  bucketsCache: Buckets | null | undefined;
  bucketsColumn: string;
}

function rowMatches(row: string[], needle: string): boolean {
  for (let i = 0; i < row.length; i++) {
    if (row[i].toLowerCase().indexOf(needle) >= 0) return true;
  }
  return false;
}

export class ReviewState {
  readonly tables: TableState[];
  activeIndex = 0;

  constructor(tables: Table[]) {
    this.tables = tables.map((table) => ({
      table,
      deleted: new Uint8Array(table.rows.length),
      deletedCount: 0,
      selected: new Uint8Array(table.rows.length),
      selectedCount: 0,
      query: "",
      matches: null,
      page: 0,
      visibleCache: null,
      undoStack: [],
      bucketsCache: undefined,
      bucketsColumn: "",
    }));
  }

  // Callers may keep and mutate what they get back, so the cached array itself
  // never leaves this class through here.
  visibleRows(tableIndex: number): number[] {
    return this.visible(tableIndex).slice();
  }

  // The summary line asks for this on every render; going through visibleRows
  // would copy a 65k-element array to read its length.
  visibleCount(tableIndex: number): number {
    return this.visible(tableIndex).length;
  }

  private visible(t: number): number[] {
    const ts = this.tables[t];
    if (ts.visibleCache !== null) return ts.visibleCache;
    let out: number[];
    if (ts.matches !== null) {
      out = ts.matches.slice();
    } else {
      out = [];
      for (let i = 0; i < ts.table.rows.length; i++) if (!ts.deleted[i]) out.push(i);
    }
    ts.visibleCache = out;
    return out;
  }

  // Anything that changes which rows are visible drops the derived view.
  // Selection and paging deliberately do not: they change nothing here.
  private invalidate(t: TableState): void {
    t.visibleCache = null;
    t.bucketsCache = undefined;
  }

  setQuery(tableIndex: number, query: string): void {
    const t = this.tables[tableIndex];
    t.query = query;
    this.recompute(t);
    this.invalidate(t);
    // A new result set has its own pages; start at the top of it.
    t.page = 0;
    // And its own selection: "Remove selected (N)" must never count rows the
    // current search has hidden away.
    this.clearSelection(tableIndex);
  }

  // Paging is display state over visibleRows: it never changes which rows are
  // donated, only how many of them are on screen at once.
  pageCount(tableIndex: number): number {
    const n = this.visible(tableIndex).length;
    return Math.max(1, Math.ceil(n / PAGE_SIZE));
  }

  pageRows(tableIndex: number): number[] {
    const t = this.tables[tableIndex];
    const start = t.page * PAGE_SIZE;
    return this.visible(tableIndex).slice(start, start + PAGE_SIZE);
  }

  setPage(tableIndex: number, page: number): void {
    const t = this.tables[tableIndex];
    const last = this.pageCount(tableIndex) - 1;
    t.page = page < 0 ? 0 : page > last ? last : page;
  }

  // Deletions can leave the current page past the end of the list.
  private clampPage(tableIndex: number): void {
    this.setPage(tableIndex, this.tables[tableIndex].page);
  }

  private recompute(t: TableState): void {
    const needle = t.query.trim().toLowerCase();
    if (needle === "") { t.matches = null; return; }
    const out: number[] = [];
    const rows = t.table.rows;
    for (let i = 0; i < rows.length; i++) {
      if (!t.deleted[i] && rowMatches(rows[i], needle)) out.push(i);
    }
    t.matches = out;
  }

  // Selection is display state: it marks rows the participant has ticked and
  // never changes `deleted` except through deleteSelected below.
  toggleSelected(tableIndex: number, row: number): void {
    const t = this.tables[tableIndex];
    if (t.deleted[row]) return;
    if (t.selected[row]) { t.selected[row] = 0; t.selectedCount--; }
    else { t.selected[row] = 1; t.selectedCount++; }
  }

  isSelected(tableIndex: number, row: number): boolean {
    return this.tables[tableIndex].selected[row] === 1;
  }

  selectedCount(tableIndex: number): number {
    return this.tables[tableIndex].selectedCount;
  }

  // Ticks every row the participant can currently see: the search result when
  // there is one, otherwise every row still in the table. Deleted rows are not
  // visible, so they cannot be caught by it.
  selectAllVisible(tableIndex: number): void {
    const t = this.tables[tableIndex];
    for (const r of this.visible(tableIndex)) {
      if (!t.deleted[r] && !t.selected[r]) { t.selected[r] = 1; t.selectedCount++; }
    }
  }

  // Drives the header tick box. An empty table (or an empty search result) is
  // not "all selected": there would be nothing for the box to stand for.
  allVisibleSelected(tableIndex: number): boolean {
    const t = this.tables[tableIndex];
    const visible = this.visible(tableIndex);
    if (visible.length === 0) return false;
    for (const r of visible) if (!t.selected[r]) return false;
    return true;
  }

  clearSelection(tableIndex: number): void {
    const t = this.tables[tableIndex];
    if (t.selectedCount === 0) return;
    t.selected.fill(0);
    t.selectedCount = 0;
  }

  deleteSelected(tableIndex: number): number {
    const t = this.tables[tableIndex];
    const rows: number[] = [];
    for (let i = 0; i < t.selected.length; i++) {
      if (t.selected[i] && !t.deleted[i]) rows.push(i);
    }
    this.clearSelection(tableIndex);
    if (rows.length === 0) return 0;
    for (const r of rows) { t.deleted[r] = 1; }
    t.deletedCount += rows.length;
    // One entry, so a single Undo brings the whole batch back.
    t.undoStack.push(rows);
    this.recompute(t);
    this.invalidate(t);
    this.clampPage(tableIndex);
    return rows.length;
  }

  deleteRow(tableIndex: number, row: number): void {
    const t = this.tables[tableIndex];
    if (t.deleted[row]) return;
    t.deleted[row] = 1;
    t.deletedCount++;
    if (t.selected[row]) { t.selected[row] = 0; t.selectedCount--; }
    t.undoStack.push([row]);
    if (t.matches !== null) {
      const idx = t.matches.indexOf(row);
      if (idx >= 0) t.matches.splice(idx, 1);
    }
    this.invalidate(t);
    this.clampPage(tableIndex);
  }

  canUndo(tableIndex: number): boolean { return this.tables[tableIndex].undoStack.length > 0; }

  // Undoes the last deletion in this table and no other, so the control beside
  // a table's deleted count only ever restores rows that count is about.
  undo(tableIndex: number): boolean {
    const t = this.tables[tableIndex];
    const rows = t.undoStack.pop();
    if (!rows) return false;
    for (const r of rows) { if (t.deleted[r]) { t.deleted[r] = 0; t.deletedCount--; } }
    this.recompute(t);
    this.invalidate(t);
    this.clampPage(tableIndex);
    return true;
  }

  keptCount(tableIndex: number): number {
    const t = this.tables[tableIndex];
    return t.table.rows.length - t.deletedCount;
  }

  // Counts of visible rows per month, or per week when the history is short.
  // One pass over the visible rows with no per-row allocation (ADR-0035);
  // cached beside visibleCache and dropped with it, so deletions and search
  // change the chart the way they change the table. The returned object is
  // the cached one: read it, do not mutate it.
  buckets(tableIndex: number, column: string): Buckets | null {
    const ts = this.tables[tableIndex];
    if (ts.bucketsCache !== undefined && ts.bucketsColumn === column) return ts.bucketsCache;
    const col = ts.table.columns.indexOf(column);
    if (col < 0) { ts.bucketsCache = null; ts.bucketsColumn = column; return null; }
    const rows = ts.table.rows;
    const visible = this.visible(tableIndex);
    // Pass 1: per-day counts keyed by day number, plus the span.
    const perDay: { [dn: number]: number } = {};
    let minDn = Infinity, maxDn = -Infinity, any = false;
    for (let k = 0; k < visible.length; k++) {
      const cell = rows[visible[k]][col];
      if (cell === undefined || !DAY_PREFIX.test(cell)) continue;
      const dn = dayNumber(cell);
      if (dn < MIN_DAY || dn > MAX_DAY) continue;
      perDay[dn] = (perDay[dn] || 0) + 1;
      if (dn < minDn) minDn = dn;
      if (dn > maxDn) maxDn = dn;
      any = true;
    }
    if (!any) { ts.bucketsCache = null; ts.bucketsColumn = column; return null; }
    const keys: string[] = [];
    const counts: number[] = [];
    let unit: "month" | "week";
    if (maxDn - minDn < WEEK_BELOW_DAYS) {
      unit = "week";
      const start = mondayOf(minDn), end = mondayOf(maxDn);
      for (let w = start; w <= end; w += 7) { keys.push(dayKey(w)); counts.push(0); }
      for (const dnStr in perDay) {
        const dn = +dnStr;
        counts[(mondayOf(dn) - start) / 7] += perDay[dn];
      }
    } else {
      unit = "month";
      const first = new Date(minDn * MS_PER_DAY), last = new Date(maxDn * MS_PER_DAY);
      const y0 = first.getUTCFullYear(), m0 = first.getUTCMonth();
      const months = (last.getUTCFullYear() - y0) * 12 + (last.getUTCMonth() - m0) + 1;
      for (let i = 0; i < months; i++) { keys.push(monthKey(y0 + Math.floor((m0 + i) / 12), (m0 + i) % 12)); counts.push(0); }
      for (const dnStr in perDay) {
        const d = new Date(+dnStr * MS_PER_DAY);
        counts[(d.getUTCFullYear() - y0) * 12 + (d.getUTCMonth() - m0)] += perDay[dnStr];
      }
    }
    ts.bucketsCache = { unit: unit, keys: keys, counts: counts };
    ts.bucketsColumn = column;
    return ts.bucketsCache;
  }
}
