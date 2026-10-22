// A pretend translation provider for tests. It never leaves the computer and
// never calls any service. It records every call so a test can prove whether
// the provider was (or was not) asked to translate something.
export function createMockProvider({
  name = "mock",
  translations = {}, // exact source text -> English text
  fail = false, // answer { ok: false, reason: "failed" }
  notConfigured = false, // answer { ok: false, reason: "not_configured" }
  throwError = false, // throw instead of answering
  reply = undefined, // always answer this text, whatever was asked
} = {}) {
  const calls = [];
  return {
    name,
    calls,
    async translate(text, from) {
      calls.push({ text, from });
      if (throwError) throw new Error("provider exploded");
      if (notConfigured) return { ok: false, reason: "not_configured" };
      if (fail) return { ok: false, reason: "failed" };
      if (reply !== undefined) return { ok: true, text: reply };
      return { ok: true, text: translations[text] ?? `[mock English] ${text}` };
    },
  };
}
