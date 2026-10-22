"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminConfigured,
  createSession,
  destroySession,
  passwordMatches,
} from "@/lib/admin-auth";
import { createRateLimiter } from "@/lib/http";

const tooManyAttempts = createRateLimiter(5, 10 * 60 * 1000); // 5 per 10 minutes

export type LoginState = { error: string } | null;

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!adminConfigured()) {
    return { error: "Admin login is not set up on this server." };
  }
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  const caller = forwarded?.split(",")[0]?.trim() || "unknown";
  if (tooManyAttempts(caller)) {
    return { error: "Too many attempts. Please wait a few minutes." };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !passwordMatches(password)) {
    return { error: "Incorrect password." };
  }
  await createSession(requestHeaders.get("host") ?? "");
  redirect("/admin/requests");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}
