// Basic security headers, sent with every response (wired up in next.config.ts).
// They are one layer of protection, not a guarantee: they do not replace
// validation, login checks or keeping the Sheet private.

export type HeaderEntry = { key: string; value: string };

// Content-Security-Policy.
//
// Trade-off: Next.js writes small inline scripts into every page so the page
// can start up. A strict policy that forbids all inline scripts needs a fresh
// random "nonce" on every request, which would force every page to be built
// again for each visitor. So scripts keep 'unsafe-inline'. That makes this
// policy weaker against injected scripts than a nonce-based one; it still
// blocks other websites from framing the app, other sites' forms, plugins,
// <base> tag tricks, and any connection or asset from another website.
//
// In development only, Next.js also needs 'unsafe-eval' and a websocket for
// live reload, so those are added only when isDev is true.
export function contentSecurityPolicy(isDev: boolean): string {
  const scripts = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])];
  const connections = ["'self'", ...(isDev ? ["ws:", "wss:"] : [])];
  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connections.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(isDev: boolean): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
    // Stops browsers guessing a file's type (a common attack trick).
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Nobody may put this app in a frame (clickjacking). The old header is
    // kept for older browsers; the CSP frame-ancestors above is the modern one.
    { key: "X-Frame-Options", value: "DENY" },
    // Admin addresses contain request and contractor IDs. Never send them to
    // other websites in a Referer header.
    { key: "Referrer-Policy", value: "no-referrer" },
    // Switch off browser features this app never uses.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];
  // Only for real (production) builds: tells browsers to use https for a year.
  // Browsers ignore it over plain http, so it is harmless on localhost.
  if (!isDev) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  }
  return headers;
}
