"use client";

import { LANGUAGES, type LanguageCode } from "@/lib/language";
import { getDict } from "@/lib/i18n";

// The language switch, as a Concept B segmented control. Each name is always
// written in its own script, so a person can find theirs even if the page is in
// a language they cannot read.
//   variant "compact": just the segmented control (the phone screens put it at
//     the top right, next to the small logo); its label and help are read out
//     by screen readers.
//   variant "full" (default): a labelled field with the help line underneath.
export default function LanguageSelector({
  language,
  onChange,
  variant = "full",
}: {
  language: LanguageCode;
  onChange: (code: LanguageCode) => void;
  variant?: "full" | "compact";
}) {
  const d = getDict(language).common;
  const buttons = LANGUAGES.map((l) => (
    <button
      key={l.code}
      type="button"
      lang={l.code}
      aria-pressed={language === l.code}
      onClick={() => onChange(l.code)}
      className={language === l.code ? "on" : undefined}
    >
      {l.native}
    </button>
  ));

  if (variant === "compact") {
    return (
      <div className="seg cb-lang" role="group" aria-label={d.languageLabel} title={d.languageHelp}>
        {buttons}
      </div>
    );
  }

  return (
    <div className="field mt-6" role="group" aria-labelledby="language-label" aria-describedby="language-help">
      <p id="language-label" className="label">
        {d.languageLabel}
      </p>
      <div className="seg seg-full cb-lang">{buttons}</div>
      <p id="language-help" className="help">
        {d.languageHelp}
      </p>
    </div>
  );
}
