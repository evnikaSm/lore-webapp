import {
  useState,
  useContext,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Upload,
  BookOpen,
} from "lucide-react";
import type { Book, Settings } from "./types";
import { ReadingAnimationContext } from "./reading-animation";
import {
  bookYear,
  today,
  schedule,
  read,
  pretty,
  available,
  forecast,
} from "./engine";
export const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
export const unitLabel = (b: Pick<Book, "unit">) =>
  b.unit === "pages" ? "стр." : "гл.";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function RestPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div className="weekdays">
      {[1, 2, 3, 4, 5, 6, 0].map((n) => (
        <button
          type="button"
          key={n}
          aria-pressed={value.includes(n)}
          className={value.includes(n) ? "selected" : ""}
          onClick={() =>
            onChange(
              value.includes(n) ? value.filter((d) => d !== n) : [...value, n],
            )
          }
        >
          {weekdays[n]}
        </button>
      ))}
    </div>
  );
}
export function BookCover({
  book,
  large = false,
}: {
  book: Book;
  large?: boolean;
}) {
  const animation = useContext(ReadingAnimationContext);
  const turning = animation?.active && animation.book.id === book.id;
  return (
    <div
      className={`book-cover ${large ? "large" : ""} cover-${book.title.length % 3} ${turning ? "is-turning" : ""}`}
    >
      {book.cover ? (
        <img src={book.cover} alt={`Обложка «${book.title}»`} />
      ) : (
        <>
          <span className="cover-author">
            {book.author || "Личная библиотека"}
          </span>
          <span className="cover-ornament">✳</span>
          <strong>{book.title}</strong>
          <span className="cover-bottom">МОЙ КНИЖНЫЙ ГОД</span>
        </>
      )}
      {turning && (
        <span key={animation.token} className="page-turn" aria-hidden="true">
          <span className="page-turn-paper" />
          <span className="page-turn-corner" />
        </span>
      )}
    </div>
  );
}
export function BookWizard({
  book,
  settings,
  year,
  onSave,
  onClose,
}: {
  book?: Book;
  settings: Settings;
  year: number;
  onSave: (b: Book) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Book>(
    book ?? {
      id: crypto.randomUUID(),
      title: "",
      author: "",
      total: 300,
      pages: 300,
      initial: 0,
      unit: "pages",
      mode: settings.mode,
      pace: settings.pace,
      start: today(),
      deadline: `${Math.max(year, new Date().getFullYear())}-12-31`,
      year,
      restDays: [...settings.restDays],
      excluded: [],
      status: "reading",
      tasks: {},
      entries: [],
    },
  );
  const [volumeUnit, setVolumeUnit] = useState(draft.unit);
  const volumes = useRef<
    Partial<Record<Book["unit"], { total: number; initial: number }>>
  >({});
  function changeUnit(unit: Book["unit"]) {
    if (unit === draft.unit) return;
    volumes.current[draft.unit] = {
      total: draft.total,
      initial: draft.initial,
    };
    const volume = volumes.current[unit] ?? { total: 0, initial: 0 };
    setDraft((d) => ({
      ...d,
      ...volume,
      unit,
      pages: d.unit === "pages" ? d.total : d.pages,
    }));
    setError("");
  }
  const change = <K extends keyof Book>(key: K, value: Book[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const preview = schedule(draft);
  const remaining = draft.total - read(draft);
  const days = available(
    draft,
    draft.start > today() ? draft.start : today(),
    draft.deadline,
  ).length;
  const prediction = forecast(preview);
  const locked =
    !!book &&
    (book.entries.length > 0 ||
      Object.keys(book.tasks).some((d) => d < today()));
  const labels = ["Книга", "Объём", "Ваш ритм", "Дни отдыха", "Готовый план"];
  function validate() {
    if (step === 0 && !draft.title.trim()) return "Введите название книги.";
    if (
      step >= 1 &&
      (!Number.isSafeInteger(draft.total) ||
        draft.total < 1 ||
        draft.total > 1000000 ||
        !Number.isSafeInteger(draft.initial) ||
        draft.initial < 0 ||
        draft.initial >= draft.total ||
        !Number.isInteger(draft.pages) ||
        draft.pages < 0 ||
        draft.pages > 1000000)
    )
      return "Проверьте объём: от 1 до 1 000 000, начальный прогресс меньше общего объёма.";
    if (
      step === 2 &&
      (!draft.start ||
        !draft.deadline ||
        draft.deadline < draft.start ||
        !Number.isInteger(draft.year) ||
        draft.year < 1900 ||
        draft.year > 9999 ||
        !Number.isInteger(draft.pace) ||
        draft.pace < 1 ||
        draft.pace > 1000000)
    )
      return "Проверьте даты, год и ежедневную норму.";
    if (step >= 3 && draft.restDays.length === 7 && draft.status === "reading")
      return "Оставьте хотя бы один день для чтения.";
    if (
      step >= 3 &&
      draft.mode === "deadline" &&
      days === 0 &&
      draft.status === "reading"
    )
      return "До выбранной даты нет доступных дней. Измените срок или выходные.";
    return "";
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    if (step === 1) setVolumeUnit(draft.unit);
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...preview,
        pages: preview.unit === "pages" ? preview.total : preview.pages,
        title: preview.title.trim(),
        author: preview.author.trim(),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить книгу.");
    } finally {
      setBusy(false);
    }
  }
  async function cover(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        file.type,
      ) ||
      file.size > 3 * 1024 * 1024
    ) {
      setError("Выберите PNG, JPEG, WebP или GIF до 3 МБ.");
      return;
    }
    const r = new FileReader();
    r.onload = () => change("cover", String(r.result));
    r.onerror = () => setError("Не удалось прочитать изображение.");
    r.readAsDataURL(file);
  }
  return (
    <Modal
      title={book ? "Настройки книги" : "Новая история начинается здесь"}
      onClose={onClose}
      wide
    >
      <div className="wizard-steps">
        {labels.map((l, i) => (
          <div key={l} className={i <= step ? "active" : ""}>
            <span>{i < step ? <Check size={13} /> : i + 1}</span>
            <small>{l}</small>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="wizard-form">
        {step === 0 && (
          <>
            <p className="eyebrow">ШАГ 1 · ВАША БИБЛИОТЕКА</p>
            <h3>Какую книгу будем читать?</h3>
            <label>
              Название книги
              <input
                autoFocus
                value={draft.title}
                maxLength={180}
                placeholder="Например, Маленькие женщины"
                onChange={(e) => change("title", e.target.value)}
              />
            </label>
            <label>
              Автор <span className="muted">· необязательно</span>
              <input
                value={draft.author}
                maxLength={140}
                placeholder="Луиза Мэй Олкотт"
                onChange={(e) => change("author", e.target.value)}
              />
            </label>
            <label className="upload-label">
              <Upload size={18} />
              {draft.cover ? "Заменить обложку" : "Загрузить обложку"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => cover(e.target.files?.[0])}
              />
            </label>
            {draft.cover && (
              <div className="cover-preview">
                <img src={draft.cover} alt="Выбранная обложка" />
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => change("cover", undefined)}
                >
                  Убрать обложку
                </button>
              </div>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <p className="eyebrow">ШАГ 2 · МАЛЕНЬКИМИ ШАГАМИ</p>
            <h3>Как вам удобнее считать?</h3>
            <div className="segmented">
              <button
                type="button"
                disabled={locked}
                className={draft.unit === "pages" ? "active" : ""}
                onClick={() => changeUnit("pages")}
              >
                Страницы
              </button>
              <button
                type="button"
                disabled={locked}
                className={draft.unit === "chapters" ? "active" : ""}
                onClick={() => changeUnit("chapters")}
              >
                Главы
              </button>
            </div>
            <label>
              Всего {draft.unit === "pages" ? "страниц" : "глав"}
              <input
                type="number"
                min="1"
                max="1000000"
                value={draft.total}
                disabled={locked}
                onChange={(e) => change("total", +e.target.value)}
              />
            </label>
            {draft.unit === "chapters" && (
              <label>
                Страниц в книге <span className="muted">· для справки</span>
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  value={draft.pages}
                  onChange={(e) => change("pages", +e.target.value)}
                />
              </label>
            )}
            <label>
              Уже прочитано до начала учёта
              <input
                type="number"
                min="0"
                max={draft.total - 1}
                disabled={locked}
                value={draft.initial}
                onChange={(e) => change("initial", +e.target.value)}
              />
            </label>
            <p className="hint">
              {locked
                ? "Объём и единица зафиксированы, чтобы сохранить точность истории."
                : "Начальный прогресс учитывается в книге, но не добавляется в статистику ежедневного чтения."}
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <p className="eyebrow">ШАГ 3 · БЕЗ СПЕШКИ</p>
            <h3>Выберите свой ритм</h3>
            <button
              type="button"
              className={`choice ${draft.mode === "deadline" ? "selected" : ""}`}
              onClick={() => change("mode", "deadline")}
            >
              <strong>Распределить до даты</strong>
              <small>Равномерный план с учётом дней отдыха</small>
            </button>
            <button
              type="button"
              className={`choice ${draft.mode === "pace" ? "selected" : ""}`}
              onClick={() => change("mode", "pace")}
            >
              <strong>Читать в своём темпе</strong>
              <small>Удобное количество каждый день</small>
            </button>
            <fieldset className="reading-unit-picker">
              <legend>Единицы чтения</legend>
              <div className="segmented">
                <button
                  type="button"
                  disabled={locked}
                  aria-pressed={draft.unit === "pages"}
                  className={draft.unit === "pages" ? "active" : ""}
                  onClick={() => changeUnit("pages")}
                >
                  Страницы
                </button>
                <button
                  type="button"
                  disabled={locked}
                  aria-pressed={draft.unit === "chapters"}
                  className={draft.unit === "chapters" ? "active" : ""}
                  onClick={() => changeUnit("chapters")}
                >
                  Главы
                </button>
              </div>
            </fieldset>
            {draft.unit !== volumeUnit && (
              <div className="unit-volume-fields">
                <label>
                  Всего {draft.unit === "pages" ? "страниц" : "глав"}
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    value={draft.total || ""}
                    placeholder={
                      draft.unit === "pages"
                        ? "Количество страниц"
                        : "Количество глав"
                    }
                    onChange={(e) => change("total", +e.target.value)}
                  />
                </label>
                <label>
                  Уже прочитано до начала учёта
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, draft.total - 1)}
                    value={draft.initial}
                    onChange={(e) => change("initial", +e.target.value)}
                  />
                </label>
              </div>
            )}
            {locked && (
              <p className="hint">
                Единица зафиксирована, чтобы сохранить историю чтения.
              </p>
            )}
            {draft.mode === "pace" && (
              <label>
                Дневная норма, {unitLabel(draft)}
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  value={draft.pace}
                  onChange={(e) => change("pace", +e.target.value)}
                />
              </label>
            )}
            <div className="form-row">
              <label>
                Начало чтения
                <input
                  type="date"
                  value={draft.start}
                  disabled={locked}
                  onChange={(e) => change("start", e.target.value)}
                />
              </label>
              <label>
                Желаемая дата окончания
                <input
                  type="date"
                  value={draft.deadline}
                  onChange={(e) => change("deadline", e.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                {draft.status === "completed" ? "Год завершения" : "Год цели"}
                <input
                  type="number"
                  min="1900"
                  max="9999"
                  value={bookYear(draft)}
                  disabled={draft.status === "completed"}
                  onChange={(e) => change("year", +e.target.value)}
                />
              </label>
              <label>
                Полка
                <select
                  value={
                    draft.status === "completed" ? "completed" : draft.status
                  }
                  disabled={draft.status === "completed"}
                  onChange={(e) =>
                    change("status", e.target.value as Book["status"])
                  }
                >
                  {draft.status === "completed" && (
                    <option value="completed">Прочитано</option>
                  )}
                  <option value="reading">Читаю сейчас</option>
                  <option value="wishlist">Хочу прочитать</option>
                  <option value="paused">Приостановлено</option>
                </select>
              </label>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <p className="eyebrow">ШАГ 4 · ВРЕМЯ ДЛЯ СЕБЯ</p>
            <h3>Отдых — тоже часть плана</h3>
            <p className="muted">
              В выбранные дни заданий не будет. Читать для удовольствия можно
              всегда.
            </p>
            <label>Регулярные выходные</label>
            <RestPicker
              value={draft.restDays}
              onChange={(v) => change("restDays", v)}
            />
            <label>
              Разовый выходной
              <input
                type="date"
                onChange={(e) => {
                  if (
                    e.target.value &&
                    !draft.excluded.includes(e.target.value)
                  )
                    change("excluded", [...draft.excluded, e.target.value]);
                }}
              />
            </label>
            <div className="chips">
              {draft.excluded.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() =>
                    change(
                      "excluded",
                      draft.excluded.filter((x) => x !== d),
                    )
                  }
                >
                  {pretty(d)} <X size={13} />
                </button>
              ))}
            </div>
            <p className="hint">
              Отдельные даты можно отмечать и в календаре. Уже прошедшие задания
              при изменении настроек сохраняются.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <div className="plan-summary">
              <BookOpen size={34} />
              <p className="eyebrow">ВАШ НОВЫЙ ЧИТАТЕЛЬСКИЙ ПЛАН</p>
              <h3>{draft.title}</h3>
              <p>
                {remaining} {unitLabel(draft)} осталось ·{" "}
                {draft.mode === "deadline"
                  ? "до " + pretty(draft.deadline)
                  : draft.pace + " " + unitLabel(draft) + " в день"}
              </p>
              <p className="muted">
                {draft.status === "wishlist"
                  ? "Книга появится на полке «Хочу прочитать»."
                  : draft.status === "paused"
                    ? "План будет приостановлен."
                    : prediction
                      ? "Прогноз завершения: " + pretty(prediction, true)
                      : "Прогноз появится после начала чтения."}
              </p>
            </div>
            {prediction && prediction > draft.deadline && (
              <p className="notice">
                В этом темпе вы закончите позже желаемой даты. Чтобы успеть,
                нужно около {Math.ceil(remaining / Math.max(1, days))}{" "}
                {unitLabel(draft)} в доступный день.
              </p>
            )}
            <p className="hint">
              Можно менять ритм в любой момент. История чтения останется с вами.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {step > 0 ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setStep(step - 1);
                setError("");
              }}
            >
              <ChevronLeft size={16} />
              Назад
            </button>
          ) : (
            <button type="button" className="btn secondary" onClick={onClose}>
              Отмена
            </button>
          )}
          <button className="btn primary" disabled={busy}>
            {busy
              ? "Сохраняем…"
              : step === 4
                ? "Сохранить книгу"
                : "Продолжить"}
            {step === 4 ? <Check size={17} /> : <ChevronRight size={17} />}
          </button>
        </div>
      </form>
    </Modal>
  );
}
