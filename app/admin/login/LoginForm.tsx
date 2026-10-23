"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    null,
  );

  return (
    <form action={formAction} className="stack" style={{ ["--gap" as string]: "16px" }}>
      {state?.error && (
        <div role="alert" className="notice notice-warn" style={{ fontWeight: 600 }}>
          {state.error}
        </div>
      )}
      <div className="field">
        <label htmlFor="password" className="label">
          Admin password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary btn-block btn-lg"
      >
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
