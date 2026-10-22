// Builds the start of a private link (bid or review) from the address the admin
// is using. Plain http is used only for this computer and for private network
// addresses (so a phone on the same Wi-Fi can open a demo link); everything else
// gets https. An address that looks odd gives "" so callers fall back to a path.
//
// Live demo only: a link that is going to ANOTHER device (a phone) cannot say
// "localhost", because on the phone that means the phone itself. When the admin
// page was opened as localhost, and `npm run demo` told us this laptop's own
// Wi-Fi addresses (CONTRACTOR_DESK_DEV_ORIGINS), the first of those is used
// instead, with the same port. Only private network addresses are ever used.
const PRIVATE_HOST =
  /^(localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[A-Za-z0-9-]+\.local)$/;
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3})$/;
const PRIVATE_IPV4 = /^(10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

export function linkBase(
  hostHeader: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  const host = hostHeader ?? "";
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return "";
  const name = host.replace(/:\d+$/, "");

  if (LOOPBACK.test(name) && env.CONTRACTOR_DESK_FIXTURES === "1" && env.NODE_ENV === "development" && !env.VERCEL) {
    const lan = (env.CONTRACTOR_DESK_DEV_ORIGINS ?? "").split(",").map((a) => a.trim()).find((a) => PRIVATE_IPV4.test(a));
    const port = /:(\d{1,5})$/.exec(host)?.[1];
    if (lan) return `http://${lan}${port ? `:${port}` : ""}`;
  }
  return `${PRIVATE_HOST.test(name) ? "http" : "https"}://${host}`;
}
