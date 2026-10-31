import { useSyncExternalStore } from "react";
import { enGB, pl, ru } from "date-fns/locale";
import { messages } from "./translations";

export type Language = "ru" | "en" | "pl";
export const languageOptions: { value: Language; label: string }[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
];
const listeners = new Set<() => void>();
export function readPreference(key: string): string | null {
  try {
    return typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The selection still works for this session when storage is unavailable.
  }
}
function isLanguage(value: unknown): value is Language {
  return value === "ru" || value === "en" || value === "pl";
}
const savedLanguage = readPreference("lore-language");
let language: Language = isLanguage(savedLanguage) ? savedLanguage : "ru";
export const getLanguage = () => language;
export const getDateLocale = () => ({ ru, en: enGB, pl })[language];
export const getIntlLocale = () =>
  ({ ru: "ru-RU", en: "en-GB", pl: "pl-PL" })[language];

function updateDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.title = translate("Мой книжный год");
}
export function setLanguage(value: Language) {
  if (!isLanguage(value)) return;
  language = value;
  savePreference("lore-language", value);
  updateDocument();
  listeners.forEach((listener) => listener());
}
export function useLanguage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getLanguage,
    () => "ru" as Language,
  );
}

/** Translate app-owned text only; user books, authors and imported data stay intact. */
export function translate(
  source: string,
  values: (string | number)[] = [],
): string {
  const key = source.replace(/\s+/g, " ").trim();
  const message = language === "ru" ? key : (messages[key]?.[language] ?? key);
  const result = message.replace(/\{(\d+)\}/g, (match, index) =>
    values[Number(index)] === undefined ? match : String(values[Number(index)]),
  );
  return (
    (source.match(/^\s+/)?.[0] ?? "") +
    result +
    (source.match(/\s+$/)?.[0] ?? "")
  );
}

if (typeof window !== "undefined") {
  updateDocument();
  window.addEventListener("storage", (event) => {
    if (event.key === "lore-language" && isLanguage(event.newValue)) {
      language = event.newValue;
      updateDocument();
      listeners.forEach((listener) => listener());
    }
  });
}
