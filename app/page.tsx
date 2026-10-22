import Link from "next/link";

const steps = [
  {
    title: "Contractor registration form",
    status: "Saves to a private Sheet",
    href: "/register",
  },
  {
    title: "Developer request form (free text)",
    status: "Manual entry, saves to Sheet",
    href: "/request",
  },
  {
    title: "Matching against consenting contractors",
    status: "Admin only",
    href: "/admin/requests",
  },
  { title: "Draft messages and WhatsApp links (you review and send)" },
  {
    title: "Outcome logging and dashboard",
    status: "Admin only",
    href: "/admin/dashboard",
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Contractor Desk for Pune Developers
      </h1>
      <p className="mt-4 text-base leading-7 text-zinc-700">
        A small experiment to learn whether residential developers in Pune need
        help finding available replacement contractors when work is disrupted.
      </p>

      <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong>Status: experiment.</strong> The problem is not yet proven.
        Nothing here is verified, and no contractor is vetted or confirmed
        available.
      </div>

      <h2 className="mt-10 text-lg font-semibold">Planned steps</h2>
      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex items-center justify-between gap-3 rounded-md border border-zinc-300 px-4 py-3 text-sm"
          >
            <span>
              {i + 1}.{" "}
              {step.href ? (
                <Link href={step.href} className="text-blue-800 underline">
                  {step.title}
                </Link>
              ) : (
                step.title
              )}
            </span>
            <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
              {step.status ?? "Not built yet"}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
