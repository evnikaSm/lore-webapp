import { translate } from "./i18n";
import { useState } from "react";
import { Cloud, RefreshCw, LogOut, UserRound, Download } from "lucide-react";
import type { AccountLibrary } from "./use-account-library";
import type { Data } from "./types";
import { cacheRepository } from "./db";
import { Modal } from "./components";
export function downloadBackup(data: Data, suffix = "") {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `my-book-year${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const phases = {
  loading: "Загружаем библиотеку…",
  guest: "Без входа в аккаунт",
  synced: "Всё сохранено в аккаунте",
  pending: "Есть изменения для синхронизации",
  syncing: "Сохраняем в аккаунт…",
  offline: "Нет сети. Изменения сохранены на устройстве",
  error: "Изменения пока только на устройстве",
  conflict: "Есть изменения на другом устройстве",
};
export function AccountPanel({ account }: { account: AccountLibrary }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<
      "logout" | "import" | "local" | "cloud" | null
    >(null);
  async function run(action: () => Promise<unknown>, close = true) {
    setError("");
    setBusy(true);
    try {
      await action();
      if (close) setConfirm(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : translate("Не удалось выполнить действие. Повторите попытку."),
      );
    } finally {
      setBusy(false);
    }
  }
  const isConflict = account.phase === "conflict";
  return (
    <section className="panel settings-panel account-panel">
      <h3>
        <Cloud size={20} />
        {translate("Ваш аккаунт")}
      </h3>
      {account.user ? (
        <>
          <div className="account-identity">
            <span className="account-avatar">
              <UserRound size={23} />
            </span>
            <div>
              <strong>
                {account.user.user_metadata.full_name || translate("Читатель")}
              </strong>
              <span>{account.user.email}</span>
            </div>
          </div>
          <p
            className={`account-status ${isConflict || account.phase === "error" ? "attention" : ""}`}
            role="status"
          >
            <span className="status-dot" />
            {translate(phases[account.phase])}
          </p>
          <p className="muted">
            {translate(
              "Книги, планы, обложки, история чтения и настройки доступны на ваших устройствах после входа в этот Google-аккаунт.",
            )}
          </p>
          {account.error && <p className="notice">{account.error}</p>}
          {isConflict && (
            <div className="account-conflict">
              <strong>{translate("Какую библиотеку оставить?")}</strong>
              <p>
                {translate(
                  "На устройстве и в аккаунте есть разные изменения. Сначала можно скачать обе копии.",
                )}
              </p>
              <div className="button-row">
                <button
                  className="btn secondary"
                  onClick={() =>
                    account.data && downloadBackup(account.data, "-device")
                  }
                >
                  <Download size={15} />
                  {translate("С устройства")}
                </button>
                <button
                  className="btn secondary"
                  onClick={() =>
                    account.conflict &&
                    downloadBackup(account.conflict.value, "-account")
                  }
                >
                  <Download size={15} />
                  {translate("Из аккаунта")}
                </button>
              </div>
              <div className="button-row">
                <button
                  className="btn primary"
                  onClick={() => setConfirm("local")}
                >
                  {translate("Оставить с устройства")}
                </button>
                <button
                  className="btn secondary"
                  onClick={() => setConfirm("cloud")}
                >
                  {translate("Оставить из аккаунта")}
                </button>
              </div>
            </div>
          )}
          {account.guestAvailable && (
            <button
              className="btn secondary full"
              disabled={busy || isConflict}
              onClick={() => setConfirm("import")}
            >
              {translate("Перенести данные с этого устройства")}
            </button>
          )}
          <div className="account-actions">
            <button
              className="btn secondary"
              disabled={busy || account.phase === "syncing" || isConflict}
              onClick={() => run(account.sync)}
            >
              <RefreshCw
                size={16}
                className={account.phase === "syncing" ? "sync-spinning" : ""}
              />
              {translate("Синхронизировать")}
            </button>
            <button
              className="text-btn"
              disabled={busy}
              onClick={() =>
                account.dirty ? setConfirm("logout") : run(account.logout)
              }
            >
              <LogOut size={16} />
              {translate("Выйти")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            {translate(
              "Войдите через Google, чтобы сохранять книги и прогресс в аккаунте и продолжать чтение на другом устройстве.",
            )}
          </p>
          <button
            className="btn google-login full"
            disabled={busy || !account.configured}
            onClick={() => run(account.login)}
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
          <p className="hint">
            {translate(
              "Имеющиеся на устройстве книги останутся с вами. После входа их можно перенести в аккаунт.",
            )}
          </p>
        </>
      )}
      {(error || account.authError) && (
        <p role="alert" className="notice">
          {error || account.authError}
        </p>
      )}
      {confirm && (
        <Modal
          title={
            confirm === "logout"
              ? translate("Выйти из аккаунта?")
              : confirm === "import"
                ? translate("Перенести локальную библиотеку?")
                : translate("Подтвердить выбор библиотеки")
          }
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p className="muted">
            {confirm === "logout"
              ? translate(
                  "Некоторые изменения ещё не сохранены в облаке. Они останутся на этом устройстве и отправятся после повторного входа в тот же аккаунт.",
                )
              : confirm === "import"
                ? translate(
                    "Книги из режима без аккаунта будут добавлены к вашей библиотеке. Существующие книги аккаунта и их история не будут заменены.",
                  )
                : confirm === "local"
                  ? translate(
                      "Библиотека в аккаунте будет заменена версией с этого устройства. На остальных устройствах появится выбранная версия.",
                    )
                  : translate(
                      "На этом устройстве будет открыта библиотека из аккаунта. Несинхронизированные изменения устройства будут заменены.",
                    )}
          </p>
          {confirm === "import" && (
            <button
              className="text-btn"
              onClick={() =>
                run(async () => {
                  const guest = await cacheRepository.read(null);
                  downloadBackup(guest.value, "-local-backup");
                }, false)
              }
            >
              <Download size={16} />
              {translate("Скачать локальную копию")}
            </button>
          )}
          {(confirm === "local" || confirm === "cloud") && (
            <p className="notice">
              {translate(
                "Перед заменой сохраните нужные резервные копии кнопками в разделе аккаунта.",
              )}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {translate("Отмена")}
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                run(
                  confirm === "logout"
                    ? account.logout
                    : confirm === "import"
                      ? account.importGuest
                      : () =>
                          account.resolve(
                            confirm === "local" ? "local" : "cloud",
                          ),
                )
              }
            >
              {busy ? translate("Подождите…") : translate("Подтвердить")}
            </button>
          </div>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
