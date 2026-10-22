"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    null,
  );

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state?.error && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900"
        >
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Admin password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2.5 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-blue-800 px-4 py-3 text-base font-semibold text-white hover:bg-blue-900 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
