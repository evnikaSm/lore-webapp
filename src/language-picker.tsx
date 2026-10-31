import {
  languageOptions,
  setLanguage,
  translate,
  useLanguage,
  type Language,
} from "./i18n";

export function LanguagePicker() {
  const language = useLanguage();
  return (
    <label className="language-picker">
      {translate("Язык приложения")}
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value} lang={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
