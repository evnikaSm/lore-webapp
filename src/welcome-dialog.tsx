import { useState } from "react";
import { BookOpen, Cloud } from "lucide-react";
import { Modal } from "./components";
import { LanguagePicker } from "./language-picker";
import { savePreference, translate } from "./i18n";
import type { AccountLibrary } from "./use-account-library";

export function WelcomeDialog({
  account,
  onClose,
}: {
  account: AccountLibrary;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function dismiss() {
    if (busy) return;
    savePreference("lore-welcome-seen", "1");
    onClose();
  }
  async function login() {
    setBusy(true);
    setError("");
    // Remember before navigating away, so the OAuth return does not reopen this dialog.
    savePreference("lore-welcome-seen", "1");
    try {
      await account.login();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : translate(
              "Не удалось открыть вход через Google. Попробуйте ещё раз.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={translate("Добро пожаловать в Lore")} onClose={dismiss}>
      <div className="welcome-intro">
        <BookOpen size={34} strokeWidth={1.4} aria-hidden="true" />
        <p className="muted">
          {translate("Ваши книги, ваш ритм, ваши истории.")}
        </p>
      </div>
      <LanguagePicker />
      <div className="notice welcome-notice">
        <Cloud size={24} aria-hidden="true" />
        <div>
          <strong>{translate("Рекомендуем войти в аккаунт")}</strong>
          <p>
            {translate(
              "Без входа книги и прогресс хранятся только в этом браузере. Они могут потеряться при очистке данных сайта, сбросе или смене устройства. Войдите через Google, чтобы сохранять библиотеку в аккаунте и открывать её на других устройствах.",
            )}
          </p>
        </div>
      </div>
      <p className="hint">
        {translate(
          "Можно начать без аккаунта. Позже войдите и выберите «Перенести данные с этого устройства». Пока вы не вошли, регулярно скачивайте резервную копию в настройках.",
        )}
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="welcome-actions">
        <button
          className="btn google-login full"
          disabled={busy || !account.configured}
          onClick={login}
        >
          <span className="google-letter" aria-hidden="true">
            G
          </span>
          {busy
            ? translate("Открываем Google…")
            : translate("Войти через Google")}
        </button>
        {!account.configured && (
          <p className="hint">
            {translate(
              "Вход в аккаунт ещё не подключён. Пока библиотека сохраняется на этом устройстве.",
            )}
          </p>
        )}
        <button
          className="btn secondary full"
          disabled={busy}
          onClick={dismiss}
        >
          {translate("Продолжить без аккаунта")}
        </button>
      </div>
    </Modal>
  );
}
