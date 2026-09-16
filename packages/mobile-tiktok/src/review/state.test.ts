import { ReviewState, PAGE_SIZE } from "./state";
import type { Table } from "../extract";

function table(id: string, rows: string[][]): Table { return { id, columns: ["Date", "Link"], rows }; }

const t1 = table("a", [["2024-01-01", "https://x/Cats"], ["2024-01-02", "https://x/dogs"], ["2024-01-03", "https://x/cats2"]]);
const t2 = table("b", [["2024-02-01", "u"]]);

test("visible rows are all rows initially", () => {
  const s = new ReviewState([t1, t2]);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
  expect(s.keptCount(0)).toBe(3);
});

test("query filters case-insensitively across cells", () => {
  const s = new ReviewState([t1]);
  s.setQuery(0, "CATS");
  expect(s.visibleRows(0)).toEqual([0, 2]);
  s.setQuery(0, "2024-01-02");
  expect(s.visibleRows(0)).toEqual([1]);
  s.setQuery(0, "");
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
});

test("deleteRow hides the row, counts it, and can be undone", () => {
  const s = new ReviewState([t1]);
  s.deleteRow(0, 1);
  expect(s.visibleRows(0)).toEqual([0, 2]);
  expect(s.tables[0].deletedCount).toBe(1);
  expect(s.canUndo(0)).toBe(true);
  expect(s.undo(0)).toBe(true);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
  expect(s.tables[0].deletedCount).toBe(0);
  expect(s.undo(0)).toBe(false);
});

test("deleting an already deleted row is a no-op", () => {
  const s = new ReviewState([t1]);
  s.deleteRow(0, 0);
  s.deleteRow(0, 0);
  expect(s.tables[0].deletedCount).toBe(1);
});

test("undo is per table: undoing in one table leaves the other's deletions alone", () => {
  const s = new ReviewState([t1, t2]);
  // Delete in table A, then in table B, then undo on A. The stack is per
  // table, so A's own deletion comes back and B keeps its own.
  s.deleteRow(0, 0);
  s.deleteRow(1, 0);
  expect(s.canUndo(0)).toBe(true);
  expect(s.canUndo(1)).toBe(true);
  expect(s.undo(0)).toBe(true);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
  expect(s.tables[0].deletedCount).toBe(0);
  expect(s.visibleRows(1)).toEqual([]);
  expect(s.tables[1].deletedCount).toBe(1);
  expect(s.canUndo(0)).toBe(false);
  expect(s.canUndo(1)).toBe(true);
  s.undo(1);
  expect(s.visibleRows(1)).toEqual([0]);
});

test("a table with nothing deleted has nothing to undo, whatever another table did", () => {
  const s = new ReviewState([t1, t2]);
  s.deleteRow(1, 0);
  // This is the misleading case the per-table stack removes: table 0 shows no
  // deletions, so it must offer no Undo either.
  expect(s.canUndo(0)).toBe(false);
  expect(s.undo(0)).toBe(false);
  expect(s.visibleRows(1)).toEqual([]);
  expect(s.tables[1].deletedCount).toBe(1);
});

test("visibleRows returns a copy that won't corrupt state", () => {
  const s = new ReviewState([t1]);
  s.setQuery(0, "cats");
  const visible1 = s.visibleRows(0);
  expect(visible1).toEqual([0, 2]);

  // Mutate the returned array
  visible1.length = 0;

  // The cached view behind it is untouched, so deleting still sees both rows.
  s.toggleSelected(0, 0);
  s.toggleSelected(0, 2);
  expect(s.deleteSelected(0)).toBe(2);

  s.setQuery(0, "");
  expect(s.visibleRows(0)).toEqual([1]);
});

test("deleteRow with query active preserves order and undo restores", () => {
  const s = new ReviewState([t1]);
  s.setQuery(0, "cats");
  expect(s.visibleRows(0)).toEqual([0, 2]);

  // Delete one match
  s.deleteRow(0, 0);
  expect(s.visibleRows(0)).toEqual([2]);

  // Delete another match
  s.deleteRow(0, 2);
  expect(s.visibleRows(0)).toEqual([]);

  // Undo restores in reverse order
  s.undo(0);
  expect(s.visibleRows(0)).toEqual([2]);
  s.undo(0);
  expect(s.visibleRows(0)).toEqual([0, 2]);
});

test("toggleSelected tracks a per-row selection and counts it", () => {
  const s = new ReviewState([t1]);
  expect(s.isSelected(0, 1)).toBe(false);
  expect(s.selectedCount(0)).toBe(0);
  s.toggleSelected(0, 1);
  expect(s.isSelected(0, 1)).toBe(true);
  expect(s.selectedCount(0)).toBe(1);
  s.toggleSelected(0, 2);
  expect(s.selectedCount(0)).toBe(2);
  s.toggleSelected(0, 1);
  expect(s.isSelected(0, 1)).toBe(false);
  expect(s.selectedCount(0)).toBe(1);
  expect(s.tables[0].deletedCount).toBe(0);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
});

test("clearSelection drops every selected row without deleting anything", () => {
  const s = new ReviewState([t1]);
  s.toggleSelected(0, 0);
  s.toggleSelected(0, 2);
  s.clearSelection(0);
  expect(s.selectedCount(0)).toBe(0);
  expect(s.isSelected(0, 0)).toBe(false);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
  expect(s.canUndo(0)).toBe(false);
});

test("deleteSelected removes the selection in one undo step and clears it", () => {
  const s = new ReviewState([t1]);
  s.toggleSelected(0, 0);
  s.toggleSelected(0, 2);
  expect(s.deleteSelected(0)).toBe(2);
  expect(s.visibleRows(0)).toEqual([1]);
  expect(s.tables[0].deletedCount).toBe(2);
  expect(s.selectedCount(0)).toBe(0);
  expect(s.undo(0)).toBe(true);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
  expect(s.tables[0].deletedCount).toBe(0);
  // Undo restores the rows, not the selection.
  expect(s.selectedCount(0)).toBe(0);
  expect(s.canUndo(0)).toBe(false);
});

test("deleteSelected with nothing selected changes nothing", () => {
  const s = new ReviewState([t1]);
  expect(s.deleteSelected(0)).toBe(0);
  expect(s.canUndo(0)).toBe(false);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
});

test("selecting an already deleted row is a no-op", () => {
  const s = new ReviewState([t1]);
  s.deleteRow(0, 1);
  s.toggleSelected(0, 1);
  expect(s.isSelected(0, 1)).toBe(false);
  expect(s.selectedCount(0)).toBe(0);
  expect(s.deleteSelected(0)).toBe(0);
  expect(s.tables[0].deletedCount).toBe(1);
});

test("selection is per table", () => {
  const s = new ReviewState([t1, t2]);
  s.toggleSelected(0, 0);
  expect(s.selectedCount(0)).toBe(1);
  expect(s.selectedCount(1)).toBe(0);
  expect(s.isSelected(1, 0)).toBe(false);
  s.toggleSelected(1, 0);
  expect(s.deleteSelected(1)).toBe(1);
  expect(s.visibleRows(1)).toEqual([]);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
  expect(s.selectedCount(0)).toBe(1);
});

test("selectAllVisible ticks the whole table, and allVisibleSelected follows it", () => {
  const s = new ReviewState([t1]);
  expect(s.allVisibleSelected(0)).toBe(false);
  s.selectAllVisible(0);
  expect(s.selectedCount(0)).toBe(3);
  expect(s.allVisibleSelected(0)).toBe(true);
  // Idempotent: ticking again must not double the count.
  s.selectAllVisible(0);
  expect(s.selectedCount(0)).toBe(3);
  s.clearSelection(0);
  expect(s.allVisibleSelected(0)).toBe(false);
  expect(s.selectedCount(0)).toBe(0);
});

test("selectAllVisible ticks only the search result, and untick clears it", () => {
  const s = new ReviewState([t1]);
  s.setQuery(0, "cats");
  expect(s.visibleRows(0)).toEqual([0, 2]);
  s.selectAllVisible(0);
  expect(s.selectedCount(0)).toBe(2);
  expect(s.allVisibleSelected(0)).toBe(true);
  // The row the search hides is not part of "all".
  expect(s.isSelected(0, 1)).toBe(false);
  expect(s.deleteSelected(0)).toBe(2);
  expect(s.visibleRows(0)).toEqual([]);
  s.setQuery(0, "");
  expect(s.visibleRows(0)).toEqual([1]);
});

test("allVisibleSelected is false while anything visible is unticked, and for an empty view", () => {
  const s = new ReviewState([t1]);
  s.toggleSelected(0, 0);
  s.toggleSelected(0, 1);
  expect(s.allVisibleSelected(0)).toBe(false);
  s.toggleSelected(0, 2);
  expect(s.allVisibleSelected(0)).toBe(true);
  // Nothing on screen is not "all selected": the box would stand for nothing.
  s.setQuery(0, "no-such-thing");
  expect(s.visibleCount(0)).toBe(0);
  expect(s.allVisibleSelected(0)).toBe(false);
});

test("selectAllVisible leaves already deleted rows alone", () => {
  const s = new ReviewState([t1]);
  s.deleteRow(0, 1);
  s.selectAllVisible(0);
  expect(s.selectedCount(0)).toBe(2);
  expect(s.isSelected(0, 1)).toBe(false);
  expect(s.deleteSelected(0)).toBe(2);
  expect(s.visibleRows(0)).toEqual([]);
});

test("visibleCount matches visibleRows without copying it", () => {
  const s = new ReviewState([t1]);
  expect(s.visibleCount(0)).toBe(3);
  s.setQuery(0, "cats");
  expect(s.visibleCount(0)).toBe(2);
});

test("deleteSelected drops the rows from an active query result", () => {
  const s = new ReviewState([t1]);
  s.setQuery(0, "cats");
  expect(s.visibleRows(0)).toEqual([0, 2]);
  s.toggleSelected(0, 0);
  expect(s.deleteSelected(0)).toBe(1);
  expect(s.visibleRows(0)).toEqual([2]);
});

function dated(n: number): Table {
  const rows: string[][] = [];
  for (let i = 0; i < n; i++) {
    const month = 1 + Math.floor(i / 40);
    const day = 1 + (i % 28);
    const mm = month < 10 ? "0" + month : String(month);
    const dd = day < 10 ? "0" + day : String(day);
    rows.push(["2024-" + mm + "-" + dd + " 09:00:00", "https://x/v" + i]);
  }
  return { id: "tiktok_watch_history", columns: ["Date", "Link"], rows };
}


test("PAGE_SIZE is 25 and pages slice the visible rows", () => {
  expect(PAGE_SIZE).toBe(25);
  const s = new ReviewState([dated(120)]);
  expect(s.pageCount(0)).toBe(5);
  expect(s.pageRows(0).length).toBe(25);
  expect(s.pageRows(0)[0]).toBe(0);
  expect(s.pageRows(0)[24]).toBe(24);
  s.setPage(0, 1);
  expect(s.pageRows(0)[0]).toBe(25);
  expect(s.pageRows(0).length).toBe(25);
  s.setPage(0, 4);
  expect(s.pageRows(0)).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119]);
});

test("an exact multiple of the page size has no trailing empty page", () => {
  const s = new ReviewState([dated(100)]);
  expect(s.pageCount(0)).toBe(4);
  s.setPage(0, 3);
  expect(s.pageRows(0).length).toBe(25);
});

test("a table that fits on one page, and an empty result, report one page", () => {
  const s = new ReviewState([dated(6)]);
  expect(s.pageCount(0)).toBe(1);
  expect(s.pageRows(0).length).toBe(6);
  s.setQuery(0, "no-such-thing");
  expect(s.pageCount(0)).toBe(1);
  expect(s.pageRows(0)).toEqual([]);
});

test("setPage clamps to the available pages", () => {
  const s = new ReviewState([dated(120)]);
  s.setPage(0, 99);
  expect(s.tables[0].page).toBe(4);
  s.setPage(0, -3);
  expect(s.tables[0].page).toBe(0);
});

test("setQuery resets the page", () => {
  const s = new ReviewState([dated(120)]);
  s.setPage(0, 2);
  s.setQuery(0, "https://");
  expect(s.tables[0].page).toBe(0);
});

test("deleting the last row of the last page steps back a page", () => {
  const s = new ReviewState([dated(26)]);
  s.setPage(0, 1);
  expect(s.pageRows(0)).toEqual([25]);
  s.toggleSelected(0, 25);
  s.deleteSelected(0);
  expect(s.tables[0].page).toBe(0);
  expect(s.pageRows(0).length).toBe(25);
  s.undo(0);
  expect(s.pageCount(0)).toBe(2);
  expect(s.tables[0].page).toBe(0);
});

test("deleteRow and a narrowing search also clamp the page", () => {
  const s = new ReviewState([dated(26)]);
  s.setPage(0, 1);
  s.deleteRow(0, 25);
  expect(s.tables[0].page).toBe(0);
  const s2 = new ReviewState([dated(26)]);
  s2.setPage(0, 1);
  s2.setQuery(0, "v25");
  expect(s2.tables[0].page).toBe(0);
});

test("paging is per table", () => {
  const s = new ReviewState([dated(120), dated(120)]);
  s.setPage(0, 2);
  expect(s.tables[0].page).toBe(2);
  expect(s.tables[1].page).toBe(0);
  expect(s.pageRows(1)[0]).toBe(0);
});

test("visible rows are computed once and reused until something changes", () => {
  const s = new ReviewState([dated(120)]);
  expect(s.visibleRows(0)).toEqual(s.visibleRows(0));
  expect(s.visibleRows(0)).not.toBe(s.visibleRows(0));    // still a copy per caller
  // Selection and paging are not visibility: they must not throw the cache away.
  s.toggleSelected(0, 0);
  s.setPage(0, 1);
  expect(s.visibleRows(0).length).toBe(120);
});

test("deleteRow, deleteSelected and setQuery all invalidate the cache", () => {
  const rows = [["2024-01-01 09:00:00", "https://x/a"], ["2024-02-01 09:00:00", "https://x/b"], ["2024-03-01 09:00:00", "https://x/c"]];
  const s = new ReviewState([{ id: "tiktok_watch_history", columns: ["Date", "Link"], rows }]);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
  s.deleteRow(0, 2);
  expect(s.visibleRows(0)).toEqual([0, 1]);
  s.setQuery(0, "2024-02");
  expect(s.visibleRows(0)).toEqual([1]);
  s.toggleSelected(0, 1);
  s.deleteSelected(0);
  expect(s.visibleRows(0)).toEqual([]);
  s.setQuery(0, "");
  expect(s.visibleRows(0)).toEqual([0]);
});

test("a new search clears the selection", () => {
  const s = new ReviewState([t1]);
  s.toggleSelected(0, 0);
  expect(s.selectedCount(0)).toBe(1);
  s.setQuery(0, "cats");
  // Remove selected must only ever count rows reachable under the search on
  // screen, so a changed search starts the selection over.
  expect(s.selectedCount(0)).toBe(0);
  expect(s.isSelected(0, 0)).toBe(false);
  s.toggleSelected(0, 2);
  s.setQuery(0, "");
  expect(s.selectedCount(0)).toBe(0);
  expect(s.deleteSelected(0)).toBe(0);
  expect(s.visibleRows(0)).toEqual([0, 1, 2]);
});

// Distinct from the dated(n) helper above, which spreads rows across months
// by index; this one takes the exact Date-cell strings a bucket test needs.
function datedList(dates: string[]): Table {
  return { id: "tiktok_watch_history", columns: ["Date", "Link"], rows: dates.map((d) => [d, "https://x"]) };
}

test("buckets by month over a long history and fills empty months", () => {
  const s = new ReviewState([datedList(["2025-06-01 10:00:00", "2025-06-15 10:00:00", "2026-09-03 10:00:00"])]);
  const b = s.buckets(0, "Date");
  expect(b && b.unit).toBe("month");
  expect(b && b.keys.length).toBe(16);
  expect(b && b.keys[0]).toBe("2025-06");
  expect(b && b.keys[15]).toBe("2026-09");
  expect(b && b.counts[0]).toBe(2);
  expect(b && b.counts[1]).toBe(0);
  expect(b && b.counts[15]).toBe(1);
});

test("buckets by ISO week when the history spans under a year", () => {
  // 2026-03-02 is a Monday; 2026-03-08 the Sunday of the same week.
  const s = new ReviewState([datedList(["2026-03-02 00:00:00", "2026-03-08 23:59:59", "2026-03-17 12:00:00"])]);
  const b = s.buckets(0, "Date");
  expect(b && b.unit).toBe("week");
  expect(b && b.keys).toEqual(["2026-03-02", "2026-03-09", "2026-03-16"]);
  expect(b && b.counts).toEqual([2, 0, 1]);
});

test("buckets skip cells that are not dates and return null when nothing parses", () => {
  const s = new ReviewState([datedList(["not a date", "2026-01-05 10:00:00"])]);
  const b = s.buckets(0, "Date");
  expect(b && b.counts).toEqual([1]);
  expect(new ReviewState([datedList(["", "x"])]).buckets(0, "Date")).toBeNull();
  expect(new ReviewState([{ id: "t", columns: ["A"], rows: [["1"]] }]).buckets(0, "Date")).toBeNull();
});

test("buckets follow deletions and search, and are cached in between", () => {
  const s = new ReviewState([datedList(["2026-01-05 10:00:00", "2026-01-20 10:00:00", "2026-02-02 10:00:00"])]);
  const first = s.buckets(0, "Date");
  expect(s.buckets(0, "Date")).toBe(first);
  s.deleteRow(0, 0);
  const afterDelete = s.buckets(0, "Date");
  expect(afterDelete).not.toBe(first);
  // The span now starts at 2026-01-20, so the first week is that of 01-19.
  expect(afterDelete && afterDelete.keys).toEqual(["2026-01-19", "2026-01-26", "2026-02-02"]);
  expect(afterDelete && afterDelete.counts).toEqual([1, 0, 1]);
  s.setQuery(0, "2026-02");
  expect(s.buckets(0, "Date")).toEqual({ unit: "week", keys: ["2026-02-02"], counts: [1] });
  s.undo(0);
  s.setQuery(0, "");
  expect(s.buckets(0, "Date")).toEqual(first);
});

test("an empty bucket result is cached until the next invalidation", () => {
  const s = new ReviewState([datedList(["x", "y"])]);
  expect(s.buckets(0, "Date")).toBeNull();
  expect(s.tables[0].bucketsCache).toBeNull();
  s.setQuery(0, "x");
  expect(s.tables[0].bucketsCache).toBeUndefined();
});
