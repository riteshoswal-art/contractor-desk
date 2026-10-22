"use client";

import { LANGUAGES, type LanguageCode } from "@/lib/language";
import { getDict } from "@/lib/i18n";

// Three large buttons, always written in each language's own script, so a
// person can find theirs even if the page is in a language they cannot read.
export default function LanguageSelector({
  language,
  onChange,
}: {
  language: LanguageCode;
  onChange: (code: LanguageCode) => void;
}) {
  const d = getDict(language).common;
  return (
    <div className="mt-6" role="group" aria-labelledby="language-label">
      <p id="language-label" className="text-sm font-medium text-zinc-900">
        {d.languageLabel}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            aria-pressed={language === l.code}
            onClick={() => onChange(l.code)}
            className="min-h-11 rounded-md border border-zinc-400 bg-white px-2 py-2 text-base font-medium text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-700 aria-pressed:border-blue-800 aria-pressed:bg-blue-800 aria-pressed:text-white"
          >
            {l.native}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-zinc-600">{d.languageHelp}</p>
    </div>
  );
}
