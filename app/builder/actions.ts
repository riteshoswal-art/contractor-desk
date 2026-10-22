"use server";

import { cookies } from "next/headers";
import { BUILDER_COOKIE, builderForSession, raiseTicket, registerBuilder, validateBuilder, type BuilderErrors } from "@/lib/builders";
import { SheetSetupError } from "@/lib/contractor-store";
import { fixturesEnabled } from "@/lib/fixtures";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { createRateLimiter, newId } from "@/lib/http";
import type { RequestErrors } from "@/lib/request";
import { botUsername, telegramToken } from "@/lib/telegram";
import { flowEnv } from "@/lib/telegram-bot";
import { askContractors } from "@/lib/telegram-flow";
import { newPairingCode, pairingUrl } from "@/lib/telegram-pairing";

// The builder's side of the LIVE DEMO (fixture mode only): register, connect
// Telegram, raise a ticket. Raising a ticket sends it straight away to the
// available contractors who connected Telegram. Logs hold short labels only.

const tooOften = createRateLimiter(30, 10 * 60 * 1000);
type Failure = { ok: false; error: "demo_only" | "too_many_requests" | "not_registered" | "service_error" };

async function currentBuilder() {
  return builderForSession((await cookies()).get(BUILDER_COOKIE)?.value);
}

async function guarded<T>(label: string, work: () => Promise<T>): Promise<T | Failure> {
  if (!fixturesEnabled()) return { ok: false, error: "demo_only" };
  if (tooOften(`builder-${label}`)) return { ok: false, error: "too_many_requests" };
  try {
    return await work();
  } catch (error) {
    console.error(`[builder] ${label} ${error instanceof SheetSetupError ? "tab_not_set_up" : "failed"}`);
    return { ok: false, error: "service_error" };
  }
}

export type RegisterResult = { ok: true } | { ok: false; error: "validation"; errors: BuilderErrors } | Failure;

export async function registerBuilderAction(input: unknown): Promise<RegisterResult> {
  return guarded("register", async () => {
    const checked = validateBuilder(input);
    if (!checked.ok) return { ok: false as const, error: "validation" as const, errors: checked.errors };
    const { token } = registerBuilder(checked.value, () => newId("D"));
    (await cookies()).set(BUILDER_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600 });
    return { ok: true as const };
  });
}

export async function signOutBuilderAction(): Promise<{ ok: true }> {
  (await cookies()).delete(BUILDER_COOKIE);
  return { ok: true };
}

export type LinkResult = { ok: true; url: string } | { ok: false; error: "no_token" | "no_bot" } | Failure;

// A one-time link that connects THIS builder's Telegram chat (valid 30 minutes).
export async function builderTelegramLinkAction(): Promise<LinkResult> {
  return guarded("link", async () => {
    const builder = await currentBuilder();
    if (!builder) return { ok: false as const, error: "not_registered" as const };
    const token = telegramToken();
    if (!token) return { ok: false as const, error: "no_token" as const };
    const username = await botUsername(token);
    if (!username) return { ok: false as const, error: "no_bot" as const };
    return { ok: true as const, url: pairingUrl(username, newPairingCode(builder.id, new Date(), "builder").code) };
  });
}

export type RaiseResult =
  | { ok: true; id: string; asked: number; notConnected: number }
  | { ok: false; error: "validation"; errors: RequestErrors }
  | { ok: false; error: "invalid" }
  | Failure;

export async function raiseTicketAction(input: unknown): Promise<RaiseResult> {
  return guarded("ticket", async () => {
    const builder = await currentBuilder();
    if (!builder) return { ok: false as const, error: "not_registered" as const };
    const sheet = getContractorSheet();
    const saved = await raiseTicket(sheet, builder, input, { recordType: getRecordType() }, () => newId("R"));
    if (!saved.ok) return saved;
    let asked = 0;
    let notConnected = 0;
    const token = telegramToken();
    if (token) {
      const r = await askContractors(sheet, saved.id, flowEnv(token));
      if (r.ok) {
        asked = r.items.filter((i) => i.status === "asked").length;
        notConnected = r.items.filter((i) => i.status === "not_connected").length;
      } else console.error(`[builder] ask ${r.error}`);
    }
    return { ok: true as const, id: saved.id, asked, notConnected };
  });
}
