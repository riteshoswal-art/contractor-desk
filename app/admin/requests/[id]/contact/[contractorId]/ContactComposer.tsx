"use client";

import { useState } from "react";
import { draftAction, linkAction } from "./actions";

const EDIT_MAX = 1000;

const LINK_ERRORS: Record<string, string> = {
  not_found:
    "This contractor is no longer a current potential match for the request. Go back and check the results.",
  not_reviewed: "Please tick the box to confirm you have read the message.",
  empty: "The message is too short.",
  too_long: "The message is too long for a WhatsApp link. Please shorten it.",
  placeholder: "Remove any text in double curly brackets, such as {{name}}.",
  no_phone:
    "There is no valid phone number on record for this contractor, so no link can be made.",
  test_contact_not_set:
    "This is a TEST record. Set TEST_CONTACT_PHONE (your own number) on the server to try the link. It will never use the contractor's number.",
  real_not_allowed:
    "Contacting real contractors is switched off on this server.",
  unavailable: "Something went wrong. Nothing was prepared. Please try again.",
  too_many_requests: "Too many drafts just now. Please wait a few minutes.",
};

const PROBLEM_TEXT: Record<string, string> = {
  ai_unavailable: "The AI draft was unavailable",
  ai_not_used: "AI drafting is used only for synthetic TEST records",
  empty: "The AI draft was empty",
  too_long: "The AI draft was too long",
  placeholder: "The AI draft had a problem with the name greeting",
  link_or_email: "The AI draft contained a link or email",
  phone_number: "The AI draft contained a phone number",
  invented_number: "The AI draft contained a number that is not in the request",
  forbidden_wording: "The AI draft used wording about money or commitments",
  formatting: "The AI draft used formatting we do not allow",
};

type Draft = {
  message: string;
  source: "ai" | "template";
  aiProblem?: string;
  recordType: "TEST" | "REAL";
  destination: "contractor" | "test" | "blocked";
  blockedReason?: string;
};

export default function ContactComposer({
  requestId,
  contractorId,
}: {
  requestId: string;
  contractorId: string;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"" | "drafting" | "linking">("");
  const [error, setError] = useState("");

  async function makeDraft() {
    setBusy("drafting");
    setError("");
    setUrl("");
    setReviewed(false);
    try {
      const result = await draftAction(requestId, contractorId);
      if (result.ok) {
        setDraft(result);
        setMessage(result.message);
      } else {
        setDraft(null);
        setError(LINK_ERRORS[result.error] ?? LINK_ERRORS.unavailable);
      }
    } catch {
      setError(LINK_ERRORS.unavailable);
    }
    setBusy("");
  }

  async function makeLink() {
    setBusy("linking");
    setError("");
    setUrl("");
    try {
      const result = await linkAction(requestId, contractorId, message, reviewed);
      if (result.ok) setUrl(result.url);
      else setError(LINK_ERRORS[result.error] ?? LINK_ERRORS.unavailable);
    } catch {
      setError(LINK_ERRORS.unavailable);
    }
    setBusy("");
  }

  const buttonClass =
    "rounded-md bg-blue-800 px-4 py-3 text-base font-semibold text-white hover:bg-blue-900 disabled:opacity-60";

  return (
    <div className="mt-6 space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900"
        >
          {error}
        </div>
      )}

      {!draft && (
        <button
          type="button"
          onClick={makeDraft}
          disabled={busy !== ""}
          className={buttonClass}
        >
          {busy === "drafting" ? "Drafting…" : "Draft a message"}
        </button>
      )}

      {draft && (
        <>
          {draft.recordType === "TEST" && (
            <div className="rounded-md border border-amber-400 bg-amber-100 p-3 text-sm font-medium text-amber-950">
              TEST record. The message is labelled as a test, and the link will
              open a chat with your own test number, never with this
              contractor.
            </div>
          )}

          <p className="text-sm text-zinc-700">
            {draft.source === "ai"
              ? "Drafted by AI from the saved request details only (the contractor's name and phone were not sent to it). AI can make mistakes, so read every word."
              : `Standard wording${draft.aiProblem ? ` (${PROBLEM_TEXT[draft.aiProblem] ?? "the AI draft was not used"})` : ""}. It only states the saved request details and asks whether they are available.`}
          </p>

          {draft.destination === "blocked" && (
            <p className="rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm">
              {LINK_ERRORS[draft.blockedReason ?? "no_phone"]} You can still
              copy the message above.
            </p>
          )}

          <div>
            <label htmlFor="message" className="block text-sm font-medium">
              Message (you can edit it)
            </label>
            <textarea
              id="message"
              rows={9}
              maxLength={EDIT_MAX}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setUrl("");
                setReviewed(false);
              }}
              className="mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2.5 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-300 p-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => {
                setReviewed(e.target.checked);
                setUrl("");
              }}
              className="mt-1 h-4 w-4 shrink-0 accent-blue-800"
            />
            <span>
              I have read this message and checked that it says nothing untrue
              or promised.
            </span>
          </label>

          {draft.destination !== "blocked" && !url && (
            <button
              type="button"
              onClick={makeLink}
              disabled={busy !== "" || !reviewed}
              className={buttonClass}
            >
              {busy === "linking" ? "Preparing…" : "Prepare WhatsApp link"}
            </button>
          )}

          {url && (
            <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-800 underline"
              >
                Open WhatsApp with this message
              </a>
              <p className="mt-2 text-zinc-800">
                Nothing has been sent. WhatsApp opens with the message ready:
                check the recipient, then press send yourself.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={makeDraft}
            disabled={busy !== ""}
            className="py-2 text-sm text-blue-800 underline"
          >
            Draft again
          </button>
        </>
      )}
    </div>
  );
}
