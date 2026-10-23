import type { LanguageCode } from "@/lib/language";

// The few words the Concept B request layout needs that lib/i18n.ts does not
// have yet (step names, the summary heading, "Back"). Everything else on the
// request screen comes from lib/i18n.ts. Move these into the main dictionary
// when it is next edited; like the rest of the Hindi and Marathi wording, they
// have not yet been reviewed by native speakers.
export type RequestCopy = {
  steps: [string, string, string];
  stepOf: string; // "{n}" is the current step
  contactTitle: string;
  summary: string;
  back: string;
};

export const REQUEST_COPY: Record<LanguageCode, RequestCopy> = {
  en: {
    steps: ["Describe", "Details", "Contact"],
    stepOf: "Step {n} of 3",
    contactTitle: "How we reach you",
    summary: "Your request",
    back: "Back",
  },
  hi: {
    steps: ["विवरण", "जानकारी", "संपर्क"],
    stepOf: "चरण {n} / 3",
    contactTitle: "हम आपसे कैसे संपर्क करें",
    summary: "आपका अनुरोध",
    back: "पीछे",
  },
  mr: {
    steps: ["वर्णन", "तपशील", "संपर्क"],
    stepOf: "पायरी {n} / 3",
    contactTitle: "आम्ही तुमच्याशी कसा संपर्क करू",
    summary: "तुमची विनंती",
    back: "मागे",
  },
};
