// Working name. Change it here when the final name is chosen.
export const APP_NAME = "LingoSwap";
export const APP_TAGLINE = "Teach each other. One small swap at a time.";

export const LANGUAGES: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  tr: "Turkish",
  ur: "Urdu",
  hi: "Hindi",
  zh: "Chinese",
  ja: "Japanese",
};

export const RTL_LANGS = new Set(["ar", "ur", "he", "fa"]);
export const langDir = (lang?: string | null) => (lang && RTL_LANGS.has(lang) ? "rtl" : "ltr");
export const langName = (lang?: string | null) => (lang ? LANGUAGES[lang] ?? lang : "");
