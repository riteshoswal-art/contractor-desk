// The human-reviewed contact step. Everything here runs on the server and takes
// the Sheet and the environment as arguments, so it can be tested without
// Google. Nothing is ever sent: the most this produces is a draft to read and a
// link a person chooses to click.
import type { ContractorSheet } from "./contractor-store";
import { httpStatusOf } from "./google-sheets";
import {
  applyTestPrefix,
  buildTemplate,
  buildWhatsAppLink,
  chooseDestination,
  cleanEditedMessage,
  fillName,
  validateDraft,
  type Destination,
  type DraftProblem,
  type MessageFacts,
} from "./message";
import { matchContractors, type Candidate, type RequestRecord } from "./match";
import { loadContractorPhone, loadContractors, loadRequests } from "./records";
import type { RecordType } from "./registration";

export type ContactEnv = {
  recordType: RecordType;
  testContactPhone: string; // the founder's own number, for trying the flow
  realContactAllowed: boolean; // true only on a production server using REAL data
  // True only when the server allows Gemini drafting (see lib/ai-policy.ts).
  // Missing means false: the fixed template is used.
  aiDrafting?: boolean;
  now?: Date;
};

export type BlockedReason = Extract<Destination, { kind: "blocked" }>["reason"];

export type DraftResult =
  | {
      ok: true;
      message: string;
      source: "ai" | "template";
      aiProblem?: DraftProblem | "ai_unavailable" | "ai_not_used";
      recordType: RecordType;
      destination: "contractor" | "test" | "blocked";
      blockedReason?: BlockedReason;
    }
  | { ok: false; error: "not_found" };

export type LinkResult =
  | { ok: true; url: string; destination: "contractor" | "test"; recordType: RecordType }
  | {
      ok: false;
      error:
        | "not_found"
        | "not_reviewed"
        | "empty"
        | "too_long"
        | "placeholder"
        | BlockedReason;
    };

export const ID_PATTERNS = {
  request: /^R-[A-Z2-9]{8}$/,
  contractor: /^C-[A-Z2-9]{8}$/,
};

// The contractor must be one of the (up to five) CURRENT potential matches for
// this request in this environment. Typing an arbitrary ID does nothing.
async function findCandidate(
  sheet: ContractorSheet,
  requestId: string,
  contractorId: string,
  env: ContactEnv,
): Promise<{ request: RequestRecord; candidate: Candidate } | null> {
  const requests = await loadRequests(sheet);
  const request = requests.find(
    (r) => r.id === requestId && r.recordType === env.recordType,
  );
  if (!request) return null;
  const contractors = await loadContractors(sheet);
  const result = matchContractors(request, contractors, {
    envType: env.recordType,
    now: env.now,
  });
  const candidate = result.candidates.find((c) => c.contractorId === contractorId);
  return candidate ? { request, candidate } : null;
}

export async function loadContactContext(
  sheet: ContractorSheet,
  requestId: string,
  contractorId: string,
  env: ContactEnv,
) {
  if (
    !ID_PATTERNS.request.test(requestId) ||
    !ID_PATTERNS.contractor.test(contractorId)
  ) {
    return null;
  }
  return findCandidate(sheet, requestId, contractorId, env);
}

function factsOf(request: RequestRecord): MessageFacts {
  return {
    trade: request.trade,
    area: request.area,
    startDate: request.startDate,
    durationDays: request.durationDays,
    notes: request.notes,
  };
}

// Only a real-data production server may ever look up a contractor's phone.
// For TEST records the contractor's number is not even read.
async function destinationFor(
  sheet: ContractorSheet,
  candidate: Candidate,
  env: ContactEnv,
): Promise<Destination> {
  const contractorPhone =
    candidate.recordType === "REAL" && env.realContactAllowed
      ? await loadContractorPhone(sheet, candidate.contractorId)
      : "";
  return chooseDestination({
    recordType: candidate.recordType,
    contractorPhone,
    testContactPhone: env.testContactPhone,
    realContactAllowed: env.realContactAllowed,
  });
}

// Step 1: produce a draft for the person to read and edit. Gemini is asked only
// when the server allows it AND the contractor is a TEST record; it then sees
// four request facts (no notes, names or phone numbers). Otherwise, or if it
// fails or breaks a rule, the fixed wording is used.
export async function createDraft(
  sheet: ContractorSheet,
  requestId: string,
  contractorId: string,
  env: ContactEnv,
  draftFn: (facts: MessageFacts) => Promise<unknown>,
): Promise<DraftResult> {
  const found = await loadContactContext(sheet, requestId, contractorId, env);
  if (!found) return { ok: false, error: "not_found" };

  const facts = factsOf(found.request);
  let template = buildTemplate(facts);
  let source: "ai" | "template" = "template";
  let aiProblem: DraftProblem | "ai_unavailable" | "ai_not_used" | undefined;

  const aiAllowed =
    env.aiDrafting === true &&
    env.recordType === "TEST" &&
    found.candidate.recordType === "TEST";

  if (!aiAllowed) {
    aiProblem = "ai_not_used";
  } else {
    // Developer notes are free text that could hold private details: never sent.
    const aiFacts: MessageFacts = { ...facts, notes: "" };
    try {
      const verdict = validateDraft(await draftFn(aiFacts), aiFacts);
      if (verdict.ok) {
        template = verdict.text;
        source = "ai";
      } else {
        aiProblem = verdict.problem;
      }
    } catch (error) {
      // A label and the numeric status only; never the message or content.
      console.error(`[admin/contact] gemini_draft_failed status=${httpStatusOf(error) ?? "unknown"}`);
      aiProblem = "ai_unavailable";
    }
  }

  const destination = await destinationFor(sheet, found.candidate, env);
  return {
    ok: true,
    message: applyTestPrefix(fillName(template, found.candidate.name), env.recordType),
    source,
    aiProblem,
    recordType: env.recordType,
    destination: destination.kind,
    blockedReason: destination.kind === "blocked" ? destination.reason : undefined,
  };
}

// Step 2: after the person has read the message and ticked "reviewed", build the
// click-to-chat link. The server re-checks everything; nothing is trusted from
// the browser except the text of the message the person approved.
export async function createLink(
  sheet: ContractorSheet,
  requestId: string,
  contractorId: string,
  message: unknown,
  reviewed: unknown,
  env: ContactEnv,
): Promise<LinkResult> {
  if (reviewed !== true) return { ok: false, error: "not_reviewed" };

  const cleaned = cleanEditedMessage(message);
  if (!cleaned.ok) return { ok: false, error: cleaned.problem };

  const found = await loadContactContext(sheet, requestId, contractorId, env);
  if (!found) return { ok: false, error: "not_found" };

  const destination = await destinationFor(sheet, found.candidate, env);
  if (destination.kind === "blocked") return { ok: false, error: destination.reason };

  const finalText = applyTestPrefix(cleaned.text, env.recordType);
  const url = buildWhatsAppLink(destination.phone, finalText);
  if (!url) return { ok: false, error: "too_long" };
  return { ok: true, url, destination: destination.kind, recordType: env.recordType };
}
