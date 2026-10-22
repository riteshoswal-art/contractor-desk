// Builds the start of a private link (bid or review) from the address the admin
// is using. Plain http is used only for this computer and for private network
// addresses (so a phone on the same Wi-Fi can open a demo link); everything else
// gets https. An address that looks odd gives "" so callers fall back to a path.
const PRIVATE_HOST =
  /^(localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[A-Za-z0-9-]+\.local)$/;

export function linkBase(hostHeader: string | null | undefined): string {
  const host = hostHeader ?? "";
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return "";
  const name = host.replace(/:\d+$/, "");
  return `${PRIVATE_HOST.test(name) ? "http" : "https"}://${host}`;
}
