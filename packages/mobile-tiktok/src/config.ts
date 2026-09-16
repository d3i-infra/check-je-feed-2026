import raw from "../../python/port/configs/tiktok_config.json";

export type Localised = { en: string; nl: string };
export type Label = Localised | string;
export interface VisualizationConfig {
  title: Localised;
  type: string;
  group?: { column: string; dateFormat?: string; label?: Label };
  values?: Array<{ aggregate?: string; label?: Label }>;
}
export interface TableConfig {
  id: string;
  title: Localised;
  description: Localised;
  headers: { [column: string]: Localised };
  extractor: string;
  visualizations?: VisualizationConfig[];
}

interface RawConfig { tables: TableConfig[] }

export const TABLES: TableConfig[] = (raw as unknown as RawConfig).tables;

export function text(t: Localised, locale: "en" | "nl"): string {
  const v = t[locale];
  return typeof v === "string" && v !== "" ? v : t.en;
}

// A config label is either a locale dict or a bare string (the desktop's zLabel).
export function label(l: Label | undefined, fallback: string, locale: "en" | "nl"): string {
  if (l === undefined) return fallback;
  if (typeof l === "string") return l;
  return text(l, locale);
}
