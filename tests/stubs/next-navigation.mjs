// Stand-in for next/navigation: redirect() throws, like the real one, and the
// error carries the destination so tests can check where a visitor is sent.
export function redirect(url) {
  const error = new Error("NEXT_REDIRECT");
  error.redirectUrl = url;
  throw error;
}
