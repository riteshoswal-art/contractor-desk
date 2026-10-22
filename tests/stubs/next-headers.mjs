// Stand-in for next/headers: an in-memory cookie jar and request headers, so
// login and admin-only code can be tested. Tests control it with the helpers.
const jar = new Map();
const options = new Map();
const requestHeaders = new Map();

export function resetRequestState() {
  jar.clear();
  options.clear();
  requestHeaders.clear();
}
export function setCookie(name, value) {
  jar.set(name, value);
}
export function getCookie(name) {
  return jar.get(name);
}
export function getCookieOptions(name) {
  return options.get(name);
}
export function setRequestHeader(name, value) {
  requestHeaders.set(name.toLowerCase(), value);
}

export async function cookies() {
  return {
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name, value, opts) => {
      jar.set(name, value);
      options.set(name, opts);
    },
    delete: (name) => {
      jar.delete(name);
      options.delete(name);
    },
  };
}

export async function headers() {
  return { get: (name) => requestHeaders.get(name.toLowerCase()) ?? null };
}
