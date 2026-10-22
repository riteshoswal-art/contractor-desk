// Server-only: the Languages tab. For every contractor registration and every
// developer request it records which language the person chose, and (for a
// request) the text exactly as written, its English version if a real
// translation exists, and how that English version was produced.
//
// The original text is NEVER replaced: it stays in the Requests tab as before,
// and a copy sits here next to the translation so the two can be compared.
// Rows are append-only; the latest row for a person or request is current.
import type { ContractorSheet } from "./contractor-store";
import { isLanguageCode, parseLanguage, type LanguageCode } from "./language";
import type { RecordType } from "./registration";
import { appendTableRow, defineTable, readTable } from "./tables";
import type { NormalizedText, TranslationStatus } from "./translation";

export const LANGUAGE_TABLE = defineTable("Languages", [
  "record_id",
  "record_type",
  "entity_type",
  "entity_id",
  "preferred_language",
  "source_language",
  "original_text",
  "english_text",
  "original_notes",
  "english_notes",
  "translation_status",
  "translation_method",
  "recorded_at",
] as const);

export type EntityType = "contractor" | "request";

export type LanguageRecord = {
  id: string;
  recordType: RecordType;
  entityType: EntityType;
  entityId: string;
  preferredLanguage: LanguageCode;
  sourceLanguage: LanguageCode | "unknown" | "";
  originalText: string;
  englishText: string;
  originalNotes: string;
  englishNotes: string;
  // "pending" when any free text still has no real English version.
  translationStatus: TranslationStatus | "";
  translationMethod: string;
  recordedAt: string;
};

const STATUSES: readonly string[] = ["not_needed", "pending", "translated", "failed"];

export function parseLanguageRow(r: Record<string, string>): LanguageRecord | null {
  if (r.record_type !== "TEST" && r.record_type !== "REAL") return null;
  if (r.entity_type !== "contractor" && r.entity_type !== "request") return null;
  const preferred = parseLanguage(r.preferred_language);
  if (!preferred || !r.entity_id) return null; // an unreadable language is not guessed
  const source = isLanguageCode(r.source_language) || r.source_language === "unknown" ? r.source_language : "";
  return {
    id: r.record_id,
    recordType: r.record_type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    preferredLanguage: preferred,
    sourceLanguage: source as LanguageRecord["sourceLanguage"],
    originalText: r.original_text,
    englishText: r.english_text,
    originalNotes: r.original_notes,
    englishNotes: r.english_notes,
    translationStatus: STATUSES.includes(r.translation_status) ? (r.translation_status as TranslationStatus) : "",
    translationMethod: r.translation_method,
    recordedAt: r.recorded_at,
  };
}

export async function loadLanguageRecords(
  sheet: ContractorSheet,
  recordType: RecordType,
): Promise<LanguageRecord[]> {
  const rows = await readTable(sheet, LANGUAGE_TABLE);
  return rows.flatMap((r) => {
    const rec = parseLanguageRow(r);
    return rec && rec.recordType === recordType ? [rec] : [];
  });
}

// Latest row per person or request.
export function latestLanguageByEntity(records: LanguageRecord[]): Map<string, LanguageRecord> {
  const map = new Map<string, LanguageRecord>();
  for (const r of records) map.set(`${r.entityType}|${r.entityId}`, r);
  return map;
}

export async function saveContractorLanguage(
  sheet: ContractorSheet,
  args: { contractorId: string; preferredLanguage: LanguageCode },
  env: { recordType: RecordType; now?: Date },
  newId: () => string,
): Promise<void> {
  await appendTableRow(sheet, LANGUAGE_TABLE, {
    record_id: newId(),
    record_type: env.recordType,
    entity_type: "contractor",
    entity_id: args.contractorId,
    preferred_language: args.preferredLanguage,
    source_language: "",
    original_text: "",
    english_text: "",
    original_notes: "",
    english_notes: "",
    translation_status: "not_needed",
    translation_method: "none",
    recorded_at: (env.now ?? new Date()).toISOString(),
  });
}

// The overall status of a request's free text: any text still without a real
// English version makes the whole record "pending" (or "failed"); only when
// every piece is fine is it "translated" or "not_needed".
export function combineStatus(parts: NormalizedText[]): TranslationStatus {
  if (parts.some((p) => p.status === "failed")) return "failed";
  if (parts.some((p) => p.status === "pending")) return "pending";
  if (parts.some((p) => p.status === "translated")) return "translated";
  return "not_needed";
}

export async function saveRequestLanguage(
  sheet: ContractorSheet,
  args: {
    requestId: string;
    preferredLanguage: LanguageCode;
    description: string;
    notes: string;
    descriptionNormalized: NormalizedText;
    notesNormalized: NormalizedText;
  },
  env: { recordType: RecordType; now?: Date },
  newId: () => string,
): Promise<TranslationStatus> {
  const status = combineStatus([args.descriptionNormalized, args.notesNormalized]);
  const method = [args.descriptionNormalized, args.notesNormalized].find((p) => p.method !== "none")?.method ?? "none";
  await appendTableRow(sheet, LANGUAGE_TABLE, {
    record_id: newId(),
    record_type: env.recordType,
    entity_type: "request",
    entity_id: args.requestId,
    preferred_language: args.preferredLanguage,
    source_language: args.descriptionNormalized.sourceLanguage,
    original_text: args.description,
    english_text: args.descriptionNormalized.englishText,
    original_notes: args.notes,
    english_notes: args.notesNormalized.englishText,
    translation_status: status,
    translation_method: method,
    recorded_at: (env.now ?? new Date()).toISOString(),
  });
  return status;
}
