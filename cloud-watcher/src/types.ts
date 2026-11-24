export type Tone = "olumlu" | "olumsuz" | "notr" | "belirsiz";
export type Mine = "held" | "watched" | null;
export type Level = "less" | "normal" | "more";

export interface KapRow {
  index: number;
  ticker: string | null;
  company: string;
  subject: string;
  summary: string;
  route: string;
  /** false for an update/correction (the backend's reason UPD). */
  isNew: boolean;
  finYear: number | null;
  finPeriod: string | null;
  publishedAt: number;
}

export interface Classified {
  kind: string;
  line: string;
  tone: Tone;
  soWhat: string | null;
}

export interface EventRow {
  idx: number;
  ticker: string;
  company: string;
  kind: string | null;
  important: number;
  line: string;
  tone: Tone;
  so_what: string | null;
  published_at: number;
  state: string;
  reason: string | null;
  sent_at: number | null;
}
