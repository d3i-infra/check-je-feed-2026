import type { Export, Language } from "./archive";
import { TABLES } from "./config";
import { get, getFirst, itemGet, isRecord, cellText } from "./lookup";
import { parseTikTokTxt } from "./txt";
import { utcTimestampToDatetimeString } from "./timestamps";
import { redactText } from "./redact";

export interface Table { id: string; columns: string[]; rows: string[][] }
export interface Extraction { tables: Table[]; errors: { [key: string]: number } }
export interface Counter { errors: { [key: string]: number }; add(key: string): void }

const REDACTED_COLUMNS = ["Comment"];

type Items = unknown[];
type Source =
  | { kind: "json"; data: unknown }
  | { kind: "txt"; language: Language; files: { [basename: string]: string } };

function makeCounter(): Counter {
  const errors: { [key: string]: number } = {};
  return { errors, add: (k) => { errors[k] = (errors[k] || 0) + 1; } };
}

function itemDate(item: unknown, errors: Counter, ...keys: string[]): string {
  const v = itemGet(item, ...(keys.length ? keys : ["Date", "Datum"]));
  return utcTimestampToDatetimeString(v === null || v === undefined ? "" : v, errors);
}

// Python: items = _parse_tiktok_txt(...); list -> items; dict -> [dict]; else -> empty
function txtItems(src: Source, nl: string, en: string): Items | null {
  if (src.kind !== "txt") return null;
  const name = src.language === "nl" ? nl : en;
  const text = src.files[name];
  if (text === undefined) return null;
  const parsed = parseTikTokTxt(text);
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed)) return [parsed];
  return null;
}

function txtMap(src: Source, nl: string, en: string): unknown {
  if (src.kind !== "txt") return null;
  const name = src.language === "nl" ? nl : en;
  const text = src.files[name];
  if (text === undefined) return null;
  return parseTikTokTxt(text);
}

function listItems(v: unknown): Items | null {
  return Array.isArray(v) ? v : null;
}

// Wraps the per-table row building: any throw becomes a counted error and an
// empty table, as the Python try/except does.
function rowsOf(errors: Counter, build: () => unknown[][]): string[][] {
  try {
    return build().map((row) => row.map(cellText));
  } catch (e) {
    errors.add(e instanceof Error ? e.name : "Error");
    return [];
  }
}

type Extractor = (src: Source, errors: Counter) => { columns: string[]; rows: string[][] };

const ACTIVITY = ["Activity", "Your Activity"];

const extractors: { [name: string]: Extractor } = {
  activity_summary_to_df(src, errors) {
    const columns = ["Metric", "Count"];
    let summary: unknown;
    if (src.kind === "json") summary = get(src.data, ACTIVITY, "Activity Summary", "ActivitySummaryMap");
    else summary = txtMap(src, "Samenvatting van activiteit.txt", "Activity Summary.txt");
    if (!isRecord(summary) || Object.keys(summary).length === 0) return { columns, rows: [] };
    const s = summary;
    const priority: [string, string[]][] = [
      ["Video's die u volledig heeft bekeken sinds uw registratie", ["videosWatchedToTheEndSinceAccountRegistration", "Videos watched to the end since account registration", "Video's tot het einde bekeken sinds accountregistratie"]],
      ["Video's waarop u heeft gereageerd sinds uw registratie", ["videosCommentedOnSinceAccountRegistration", "commentVideoCount", "Videos commented on since account registration", "Video's waarop is gereageerd sinds accountregistratie"]],
      ["Video's die u heeft gedeeld sinds uw registratie", ["videosSharedSinceAccountRegistration", "sharedVideoCount", "Videos shared since account registration", "Video's gedeeld sinds accountregistratie"]],
    ];
    return { columns, rows: rowsOf(errors, () => {
      const rows: unknown[][] = [];
      for (const [label, keys] of priority) {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(s, key)) { rows.push([label, s[key]]); break; }
        }
      }
      return rows;
    }) };
  },

  watch_history_to_df(src, errors) {
    return dateLink(src, errors, () => get(src.kind === "json" ? src.data : null, ACTIVITY, ["Video Browsing History", "Watch History"], "VideoList"), "Kijkgeschiedenis.txt", "Watch History.txt");
  },

  favorite_videos_to_df(src, errors) {
    return dateLink(src, errors, () => getFirst(src.kind === "json" ? src.data : null, [ACTIVITY, "Favorite Videos", "FavoriteVideoList"], ["Likes and Favorites", "Favorite Videos", "FavoriteVideoList"]), "Favoriete video's.txt", "Favorite Videos.txt");
  },

  follower_to_df(src, errors) {
    return dateUser(src, errors, () => getFirst(src.kind === "json" ? src.data : null, [ACTIVITY, "Follower List", "FansList"], ["Profile And Settings", "Follower", "FansList"]), "Volger.txt", "Follower.txt", ["UserName", "User Name", "Gebruikersnaam"]);
  },

  following_to_df(src, errors) {
    return dateUser(src, errors, () => getFirst(src.kind === "json" ? src.data : null, [ACTIVITY, ["Following List", "Following"], "Following"], ["Profile And Settings", "Following", "Following"]), "Volgend.txt", "Following.txt", ["UserName", "User Name", "Gebruikersnaam", "Username"]);
  },

  like_list_to_df(src, errors) {
    return dateLink(src, errors, () => getFirst(src.kind === "json" ? src.data : null, [ACTIVITY, "Like List", "ItemFavoriteList"], ["Likes and Favorites", "Like List", "ItemFavoriteList"]), "Likelijst.txt", "Like List.txt");
  },

  comments_to_df(src, errors) {
    const columns = ["Date", "Comment", "Photo", "Url"];
    const items = src.kind === "json" ? listItems(get(src.data, "Comment", "Comments", "CommentsList")) : txtItems(src, "Reacties.txt", "Comments.txt");
    if (!items) return { columns, rows: [] };
    return { columns, rows: rowsOf(errors, () => items.map((item) => [itemDate(item, errors), itemGet(item, "Comment", "Reactie"), itemGet(item, "Photo", "Foto"), itemGet(item, "Url", "Link", "originalPostUrl", "Original Post Link", "Link naar origineel bericht", "Originele link naar bericht")])) };
  },
};

function dateLink(src: Source, errors: Counter, json: () => unknown, nl: string, en: string) {
  const columns = ["Date", "Link"];
  const items = src.kind === "json" ? listItems(json()) : txtItems(src, nl, en);
  if (!items) return { columns, rows: [] };
  return { columns, rows: rowsOf(errors, () => items.map((item) => [itemDate(item, errors), itemGet(item, "Link")])) };
}

function dateUser(src: Source, errors: Counter, json: () => unknown, nl: string, en: string, userKeys: string[]) {
  const columns = ["Date", "UserName"];
  const items = src.kind === "json" ? listItems(json()) : txtItems(src, nl, en);
  if (!items) return { columns, rows: [] };
  return { columns, rows: rowsOf(errors, () => items.map((item) => [itemDate(item, errors), itemGet(item, ...userKeys)])) };
}

export function extractUsername(exp: Export): string | null {
  let v: unknown;
  if (exp.kind === "json") {
    v = getFirst(exp.data,
      ["Profile And Settings", "Profile Info", "ProfileMap", "userName"],
      ["Profile", "Profile Information", "ProfileMap", "userName"],
      ["Profile", "Profile Info", "ProfileMap", "userName"],
      ["Profile And Settings", "Profile Information", "ProfileMap", "userName"]);
  } else {
    const parsed = txtMap(exp, "Profielinformatie.txt", "Profile Information.txt");
    if (isRecord(parsed)) v = getFirst(parsed, ["Username"], ["Gebruikersnaam"], ["username"]);
  }
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function extractTable(id: string, exp: Export, errors: Counter): Table {
  const cfg = TABLES.filter((t) => t.id === id)[0];
  if (!cfg) throw new Error("unknown table " + id);
  const fn = extractors[cfg.extractor];
  if (!fn) throw new Error("unknown extractor " + cfg.extractor);
  const out = fn(exp, errors);
  return { id, columns: out.columns, rows: out.rows };
}

interface Run { errors: Counter; username: string | null; tables: Table[] }

function beginRun(exp: Export): Run {
  return { errors: makeCounter(), username: extractUsername(exp), tables: [] };
}

// One table's work. The synchronous and the yielding driver below share it so
// the two can never extract different things.
function runStep(run: Run, exp: Export, id: string): void {
  const t = extractTable(id, exp, run.errors);
  if (t.rows.length === 0) return;
  const redactIdx = t.columns.map((c, i) => (REDACTED_COLUMNS.indexOf(c) >= 0 ? i : -1)).filter((i) => i >= 0);
  if (redactIdx.length) {
    for (const row of t.rows) for (const i of redactIdx) row[i] = redactText(row[i], run.username);
  }
  run.tables.push(t);
}

function endRun(run: Run): Extraction {
  return { tables: run.tables, errors: run.errors.errors };
}

export function runExtraction(exp: Export): Extraction {
  const run = beginRun(exp);
  for (const cfg of TABLES) runStep(run, exp, cfg.id);
  return endRun(run);
}

// The same extraction, handing control back to the browser between tables so a
// large export cannot hold the main thread long enough for iOS to reload the
// page. Yields TABLES.length - 1 times: never after the last table.
export function runExtractionAsync(exp: Export, yieldToUi: () => Promise<void>): Promise<Extraction> {
  const run = beginRun(exp);
  let i = 0;
  function step(): Promise<Extraction> {
    if (i >= TABLES.length) return Promise.resolve(endRun(run));
    runStep(run, exp, TABLES[i].id);
    i++;
    if (i >= TABLES.length) return Promise.resolve(endRun(run));
    return yieldToUi().then(step);
  }
  return step();
}
