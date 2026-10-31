import {
  translate,
  useLanguage,
  getDateLocale,
  getIntlLocale,
  readPreference,
  savePreference,
} from "./i18n";
import { LanguagePicker } from "./language-picker";
import { WelcomeDialog } from "./welcome-dialog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Sun,
  LibraryBig,
  CalendarDays,
  ChartNoAxesCombined,
  Settings2,
  Plus,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Target,
  Download,
  Upload,
  Check,
  Coffee,
  MoreHorizontal,
  Search,
  Flame,
  Trophy,
  CircleHelp,
  CheckCheck,
  BookMarked,
  WifiOff,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  parseISO,
  format,
} from "date-fns";
import {
  ReadingAnimationContext,
  type ReadingAnimation,
} from "./reading-animation";
import type { Book, Data, Unit } from "./types";
import { parseBackup } from "./db";
import { useAccountLibrary, type AccountLibrary } from "./use-account-library";
import { AccountPanel } from "./account-panel";
import {
  bookYear,
  today,
  pretty,
  plus,
  dateKey,
  read,
  actual,
  daily,
  debt,
  allocations,
  forecast,
  schedule,
  record,
  streak,
  isRest,
  available,
} from "./engine";
import {
  Modal,
  BookWizard,
  BookCover,
  RestPicker,
  unitLabel,
} from "./components";

type Page = "today" | "books" | "calendar" | "progress" | "settings" | "goals";
const nav = [
  { id: "today", label: "Сегодня", icon: Sun },
  { id: "books", label: "Мои книги", icon: LibraryBig },
  { id: "calendar", label: "Календарь", icon: CalendarDays },
  { id: "progress", label: "Мой прогресс", icon: ChartNoAxesCombined },
  { id: "settings", label: "Настройки", icon: Settings2 },
] as const;
const statusNames = {
  reading: "Читаю сейчас",
  wishlist: "Хочу прочитать",
  completed: "Прочитано",
  paused: "Приостановлено",
};
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={32} strokeWidth={1.3} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function ProgressRing({
  value,
  size = 112,
  children,
}: {
  value: number;
  size?: number;
  children?: ReactNode;
}) {
  const r = 44,
    c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        aria-label={translate("Прогресс {0}%", [Math.round(value)])}
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          opacity=".12"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#736F4E"
          strokeWidth="7"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, value) / 100)}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div>
        {children ?? (
          <strong>
            {Math.round(value)}
            <small>%</small>
          </strong>
        )}
      </div>
    </div>
  );
}
export default function App() {
  useLanguage();
  const [welcome, setWelcome] = useState(
    () => readPreference("lore-welcome-seen") !== "1",
  );
  const account = useAccountLibrary();
  useEffect(() => {
    if (account.user) {
      savePreference("lore-welcome-seen", "1");
      setWelcome(false);
    }
  }, [account.user?.id]);
  const data = account.data;
  const loadError = account.authError;
  const [page, setPage] = useState<Page>("today");
  const [year, setYear] = useState(new Date().getFullYear());
  const [wizard, setWizard] = useState<Book | "new" | null>(null);
  const [log, setLog] = useState<{ book: Book; date: string } | null>(null);
  const [detail, setDetail] = useState<Book | null>(null);
  const [toast, setToast] = useState("");
  const [readingAnimation, setReadingAnimation] =
    useState<ReadingAnimation | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(today());
  useEffect(() => {
    const capture = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const net = () => setOnline(navigator.onLine);
    const tick = () => setNow(today());
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    const timer = window.setInterval(tick, 30000);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!readingAnimation?.active) return;
    const timer = window.setTimeout(
      () =>
        setReadingAnimation((current) =>
          current?.token === readingAnimation.token
            ? { ...current, active: false }
            : current,
        ),
      650,
    );
    return () => window.clearTimeout(timer);
  }, [readingAnimation]);
  async function commit(update: (d: Data) => Data) {
    try {
      await account.commit(update);
    } catch (e) {
      setToast(
        translate(
          "Не удалось сохранить данные. Проверьте свободное место и разрешения браузера.",
        ),
      );
      throw e;
    }
  }
  useEffect(() => {
    setWizard(null);
    setLog(null);
    setDetail(null);
    setReadingAnimation(null);
    setToast("");
  }, [account.user?.id]);
  async function putBook(b: Book) {
    await commit((d) => ({
      ...d,
      books: d.books.some((x) => x.id === b.id)
        ? d.books.map((x) => (x.id === b.id ? b : x))
        : [...d.books, b],
    }));
    setToast(translate("Книга сохранена. Приятного чтения!"));
  }
  async function addRead(b: Book, amount: number, date: string) {
    let completed = false;
    let savedBook = b;
    let before = read(b);
    await commit((d) => ({
      ...d,
      books: d.books.map((x) => {
        if (x.id !== b.id) return x;
        before = read(x);
        const next = record(x, amount, date);
        savedBook = next;
        completed = next.status === "completed";
        return next;
      }),
    }));
    const message = completed
      ? translate("Книга завершена! Ещё одна история в вашей коллекции.")
      : translate("Чтение сохранено. Ещё один шаг вперёд!");
    setReadingAnimation({
      book: savedBook,
      token: crypto.randomUUID(),
      active: true,
      before,
      message,
    });
    setToast(message);
  }
  function go(p: Page) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (!data)
    return (
      <main className="loading">
        <img className="loading-logo" src="/lore-icon-192.png" alt="Lore" />
        <h1>{translate("Мой книжный год")}</h1>
        <p>{loadError || translate("Открываем вашу библиотеку…")}</p>
        {loadError && (
          <button className="btn primary" onClick={() => location.reload()}>
            {translate("Попробовать снова")}
          </button>
        )}
      </main>
    );
  const books = data.books;
  const selected = books.filter((b) => bookYear(b) === year);
  const active = books.filter((b) => b.status === "reading");
  const done = selected.filter((b) => b.status === "completed").length;
  const goal = data.settings.goals[year] ?? 20;
  const yearSelect = (
    <select
      aria-label={translate("Год читательской цели")}
      className="year-select"
      value={year}
      onChange={(e) => setYear(+e.target.value)}
    >
      {Array.from(
        new Set([
          new Date().getFullYear() - 2,
          new Date().getFullYear() - 1,
          new Date().getFullYear(),
          new Date().getFullYear() + 1,
          year,
          ...books.flatMap((b) => [b.year, bookYear(b)]),
          ...Object.keys(data.settings.goals).map(Number),
        ]),
      )
        .sort((a, b) => b - a)
        .map((y) => (
          <option key={y}>{y}</option>
        ))}
    </select>
  );
  const addButton = (
    <button className="btn primary" onClick={() => setWizard("new")}>
      <Plus size={18} />
      {translate("Добавить книгу")}
    </button>
  );
  return (
    <ReadingAnimationContext.Provider value={readingAnimation}>
      <div className="app-shell">
        <div className="main-shell">
          <header className="topbar">
            <button
              className="app-brand"
              onClick={() => go("today")}
              aria-label={translate("Мой книжный год — на главный экран")}
            >
              <img className="app-logo" src="/lore-icon-192.png" alt="" />
              <span>{translate("Мой книжный год")}</span>
            </button>
            <div className="topbar-right">
              {!online && (
                <span
                  className="offline-label"
                  aria-label={translate("Нет подключения к интернету")}
                >
                  <WifiOff size={17} />
                </span>
              )}
              {yearSelect}
            </div>
          </header>
          <main className="main-content">
            {page === "today" && (
              <>
                <div className="page-heading today-heading">
                  <div>
                    <p className="eyebrow date">
                      {format(parseISO(now), "EEEE, d MMMM", {
                        locale: getDateLocale(),
                      })}
                    </p>
                    <h1>{translate("Сегодня")}</h1>
                  </div>
                  {active.length > 0 && addButton}
                </div>
                {books.length > 0 && (
                  <div className="summary-grid">
                    <SummaryCard
                      icon={<BookOpen size={20} />}
                      label={translate("План")}
                      books={active}
                      value={(b) => daily(b, now).target}
                    />
                    <SummaryCard
                      icon={<CheckCheck size={20} />}
                      label={translate("Прочитано")}
                      books={books}
                      value={(b) => actual(b, now)}
                      green
                    />
                    <SummaryCard
                      icon={<Coffee size={20} />}
                      label={translate("Осталось")}
                      books={active}
                      value={(b) => daily(b, now).left}
                      orange
                    />
                  </div>
                )}
                <DebtSummary
                  books={books}
                  now={now}
                  onOpen={() => go("calendar")}
                />
                <div className="dashboard-columns">
                  <section id="daily-books">
                    <div className="section-heading">
                      <h2>
                        {translate("Читаю сейчас ")}
                        <span>{active.length}</span>
                      </h2>
                      <button className="text-btn" onClick={() => go("books")}>
                        {translate("Все книги")}
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                    {active.length ? (
                      <div className="active-books">
                        {active.map((b) => (
                          <ReadingCard
                            key={b.id}
                            book={b}
                            now={now}
                            onRead={() => setLog({ book: b, date: now })}
                            onEdit={() => setWizard(b)}
                            onPlan={() => setDetail(b)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="panel">
                        <Empty
                          title={
                            books.length
                              ? translate("Что почитаем дальше?")
                              : translate("Добавьте первую книгу")
                          }
                          action={addButton}
                        >
                          {translate(
                            "Выберите удобный темп — и ваш план чтения появится здесь.",
                          )}
                        </Empty>
                      </div>
                    )}
                  </section>
                </div>
                <button
                  className="annual-summary panel"
                  onClick={() => go("goals")}
                  aria-label={translate("Моя цель на год")}
                >
                  <span className="annual-summary-icon">
                    <Target size={21} />
                  </span>
                  <div>
                    <span>{translate("Цель на {0} год", [year])}</span>
                    <strong>
                      {translate("{0} из {1} книг", [done, goal])}
                    </strong>
                    <div className="progress-track">
                      <i
                        style={{
                          width: `${Math.min(100, (done / goal) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <ChevronRight size={20} />
                </button>
              </>
            )}
            {page === "books" && (
              <Library
                books={selected}
                addButton={addButton}
                onRead={(b) => setLog({ book: b, date: now })}
                onEdit={setWizard}
                onPlan={setDetail}
                now={now}
                year={year}
              />
            )}
            {page === "calendar" && (
              <Calendar
                books={books}
                now={now}
                onRead={(b, date) => setLog({ book: b, date })}
                onRest={async (b, date) => {
                  if (date < now) {
                    setToast(
                      translate(
                        "Прошедшие задания сохраняются. Выберите сегодняшний или будущий день.",
                      ),
                    );
                    return;
                  }
                  await putBook(
                    schedule({
                      ...b,
                      excluded: b.excluded.includes(date)
                        ? b.excluded.filter((x) => x !== date)
                        : [...b.excluded, date],
                    }),
                  );
                }}
              />
            )}
            {page === "progress" && (
              <Analytics
                books={selected}
                allBooks={books}
                year={year}
                now={now}
                goal={goal}
              />
            )}
            {page === "goals" && (
              <Goals
                books={selected}
                year={year}
                goal={goal}
                onGoal={async (n) => {
                  await commit((d) => ({
                    ...d,
                    settings: {
                      ...d.settings,
                      goals: { ...d.settings.goals, [year]: n },
                    },
                  }));
                  setToast(translate("Годовая цель сохранена."));
                }}
                onPlan={setDetail}
                addButton={addButton}
              />
            )}
            {page === "settings" && (
              <SettingsPage
                account={account}
                data={data}
                year={year}
                install={install}
                onInstall={async () => {
                  if (install) {
                    await install.prompt();
                    await install.userChoice;
                    setInstall(null);
                  }
                }}
                onChange={async (settings) => {
                  await commit((d) => ({ ...d, settings }));
                  setToast(translate("Настройки сохранены."));
                }}
                onImport={async (next) => {
                  await commit(() => next);
                  setToast(translate("Резервная копия восстановлена."));
                }}
                onError={setToast}
              />
            )}
          </main>
        </div>
        {welcome && !account.user && (
          <WelcomeDialog account={account} onClose={() => setWelcome(false)} />
        )}
        <nav
          className="bottom-nav"
          aria-label={translate("Основная навигация")}
        >
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={20} />
              <span>
                {id === "progress"
                  ? translate("Прогресс")
                  : id === "books"
                    ? translate("Книги")
                    : translate(label)}
              </span>
            </button>
          ))}
        </nav>
        {wizard && (
          <BookWizard
            book={wizard === "new" ? undefined : wizard}
            settings={data.settings}
            year={year}
            onSave={putBook}
            onClose={() => setWizard(null)}
          />
        )}
        {log && (
          <LogDialog
            book={books.find((b) => b.id === log.book.id) ?? log.book}
            date={log.date}
            now={now}
            onSave={async (n, d) => {
              await addRead(log.book, n, d);
            }}
            onClose={() => setLog(null)}
          />
        )}
        {detail && (
          <BookDetail
            book={books.find((b) => b.id === detail.id) ?? detail}
            now={now}
            onClose={() => setDetail(null)}
            onEdit={() => {
              setWizard(books.find((b) => b.id === detail.id) ?? detail);
              setDetail(null);
            }}
            onRead={() => {
              setLog({
                book: books.find((b) => b.id === detail.id) ?? detail,
                date: now,
              });
              setDetail(null);
            }}
            onDelete={async () => {
              await commit((d) => ({
                ...d,
                books: d.books.filter((b) => b.id !== detail.id),
              }));
              setDetail(null);
              setToast(translate("Книга удалена."));
            }}
            onComplete={async () => {
              const b = books.find((x) => x.id === detail.id)!;
              if (read(b) < b.total) await addRead(b, b.total - read(b), now);
            }}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            {readingAnimation?.message === toast ? (
              <>
                <span className="reading-toast-art" aria-hidden="true">
                  <BookCover book={readingAnimation.book} />
                </span>
                <span className="reading-toast-copy">
                  {toast}
                  <span className="reading-toast-progress" aria-hidden="true">
                    <i
                      key={readingAnimation.token}
                      style={
                        {
                          width:
                            (read(readingAnimation.book) /
                              readingAnimation.book.total) *
                              100 +
                            "%",
                          "--reading-before":
                            (readingAnimation.before /
                              readingAnimation.book.total) *
                              100 +
                            "%",
                        } as import("react").CSSProperties
                      }
                    />
                  </span>
                </span>
              </>
            ) : (
              <>
                <Check size={18} />
                <span>{toast}</span>
              </>
            )}
            <button
              aria-label={translate("Скрыть сообщение")}
              onClick={() => setToast("")}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </ReadingAnimationContext.Provider>
  );
}
function SummaryCard({
  icon,
  label,
  books,
  value,
  green = false,
  orange = false,
}: {
  icon: ReactNode;
  label: string;
  books: Book[];
  value: (b: Book) => number;
  green?: boolean;
  orange?: boolean;
}) {
  const pages = books
      .filter((b) => b.unit === "pages")
      .reduce((s, b) => s + value(b), 0),
    chapters = books
      .filter((b) => b.unit === "chapters")
      .reduce((s, b) => s + value(b), 0);
  return (
    <div className={`summary-card ${green ? "green" : ""} ${orange ? "orange" : ""}`}>
      <span className="stat-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>
          {pages} <small>{translate("стр.")}</small>
          {chapters > 0 && (
            <span className="second-unit">
              {" "}
              + {chapters} <small>{translate("гл.")}</small>
            </span>
          )}
        </strong>
      </div>
    </div>
  );
}
function ReadingCard({
  book: b,
  now,
  onRead,
  onEdit,
  onPlan,
}: {
  book: Book;
  now: string;
  onRead: () => void;
  onEdit: () => void;
  onPlan: () => void;
}) {
  const d = daily(b, now),
    debts = debt(b, now),
    owed = debts.reduce((s, t) => s + t.left, 0),
    f = forecast(b, now);
  return (
    <article className="reading-card panel">
      <div className="reading-main">
        <button
          className="cover-button"
          onClick={onPlan}
          aria-label={translate("Открыть {0}", [b.title])}
        >
          <BookCover book={b} />
        </button>
        <div className="reading-info">
          <div className="book-title-row">
            <span className="tag">
              {b.unit === "pages"
                ? translate("ПО СТРАНИЦАМ")
                : translate("ПО ГЛАВАМ")}
            </span>
            <button
              className="icon-btn"
              aria-label={translate("Настройки книги {0}", [b.title])}
              onClick={onEdit}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
          <h3>
            <button onClick={onPlan}>{b.title}</button>
          </h3>
          <p className="author">{b.author || translate("Автор не указан")}</p>
          <div className="progress-label">
            <span>
              {read(b)}
              {translate(" из ")}
              {b.total} {unitLabel(b)}
            </span>
            <strong>{Math.round((read(b) / b.total) * 100)}%</strong>
          </div>
          <div className="progress-track">
            <i style={{ width: `${(read(b) / b.total) * 100}%` }} />
          </div>
          <div className="today-task">
            <strong>
              {d.left
                ? translate("{0} {1} осталось сегодня", [d.left, unitLabel(b)])
                : d.target
                  ? translate("План на сегодня выполнен")
                  : translate("Сегодня можно отдохнуть")}
            </strong>
            <small>
              {translate("План: ")}
              {d.target}
              {translate(" · Прочитано сегодня: ")}
              {actual(b, now)} {unitLabel(b)}
            </small>
          </div>
        </div>
      </div>
      {owed > 0 && (
        <div className="debt-banner">
          <Coffee size={17} />
          <div>
            <strong>
              {translate("Можно наверстать: ")}
              {owed} {unitLabel(b)}
            </strong>
            <span>
              {translate("Осталось за {0} дн. Читайте в удобном темпе.", [
                debts.length,
              ])}
            </span>
          </div>
          <button className="text-btn" onClick={onPlan}>
            {translate("Даты")}
            <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      <div className="reading-footer">
        <span>
          <CalendarDays size={14} />
          {f
            ? translate("Прогноз: ") + pretty(f)
            : translate("Нет доступных дней")}
        </span>
        <div>
          <button className="text-btn plan-btn" onClick={onPlan}>
            {translate("Посмотреть план")}
          </button>
          <button className="btn primary small" onClick={onRead}>
            <Plus size={15} />
            {translate("Отметить прочитанное")}
          </button>
        </div>
      </div>
      {f && f > b.deadline && (
        <p className="pace-warning">
          {b.deadline < now
            ? translate(
                "Желаемая дата уже прошла. Выберите новый срок в настройках книги.",
              )
            : translate(
                "В этом темпе вы закончите позже срока. Чтобы успеть: около {0} {1} в доступный день с учётом долга.",
                [
                  Math.ceil(
                    (b.total - read(b)) /
                      Math.max(1, available(b, now, b.deadline).length),
                  ),
                  unitLabel(b),
                ],
              )}
        </p>
      )}
    </article>
  );
}
function Library({
  books,
  addButton,
  onRead,
  onEdit,
  onPlan,
  now,
  year,
}: {
  books: Book[];
  addButton: ReactNode;
  onRead: (b: Book) => void;
  onEdit: (b: Book) => void;
  onPlan: (b: Book) => void;
  now: string;
  year: number;
}) {
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const filtered = books.filter(
    (b) =>
      (filter === "all" || b.status === filter) &&
      `${b.title} ${b.author}`
        .toLocaleLowerCase(getIntlLocale())
        .includes(search.toLocaleLowerCase(getIntlLocale())),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{translate("Мои книги")}</h1>
        </div>
        {addButton}
      </div>
      <div className="library-toolbar">
        <div className="tabs">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            {translate("Все ")}
            <span>{books.length}</span>
          </button>
          {Object.entries(statusNames).map(([key, name]) => (
            <button
              key={key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {translate(name)}
              <span>{books.filter((b) => b.status === key).length}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label={translate("Найти книгу")}
            placeholder={translate("Название или автор")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {!filtered.length ? (
        <div className="panel">
          <Empty
            title={
              search
                ? translate("Книга не нашлась")
                : translate("На этой полке пока тихо")
            }
          >
            {search
              ? translate("Попробуйте другое название или имя автора.")
              : translate("Добавьте книгу, которую давно хотелось открыть.")}
          </Empty>
        </div>
      ) : (
        <div className="library-grid">
          {filtered.map((b) => (
            <article className="panel library-book" key={b.id}>
              <button
                className="cover-button"
                onClick={() => onPlan(b)}
                aria-label={translate("Открыть {0}", [b.title])}
              >
                <BookCover book={b} large />
              </button>
              <span className={`status-tag ${b.status}`}>
                {translate(statusNames[b.status])}
              </span>
              <h3>
                <button onClick={() => onPlan(b)}>{b.title}</button>
              </h3>
              <p className="author">
                {b.author || translate("Автор не указан")}
              </p>
              <div className="progress-label">
                <span>
                  {read(b)} / {b.total} {unitLabel(b)}
                </span>
                <strong>{Math.round((read(b) / b.total) * 100)}%</strong>
              </div>
              <div className="progress-track">
                <i style={{ width: `${(read(b) / b.total) * 100}%` }} />
              </div>
              <div className="library-actions">
                <button
                  className="btn secondary small"
                  onClick={() => onEdit(b)}
                  aria-label={translate("Настройки {0}", [b.title])}
                >
                  <Settings2 size={16} />
                </button>
                {b.status === "reading" ? (
                  <button
                    className="btn primary small"
                    onClick={() => onRead(b)}
                  >
                    <Plus size={15} />
                    {translate("Записать чтение")}
                  </button>
                ) : (
                  <button
                    className="btn secondary small"
                    onClick={() =>
                      b.status === "completed" ? onPlan(b) : onEdit(b)
                    }
                  >
                    {b.status === "completed"
                      ? translate("История чтения")
                      : translate("Настроить чтение")}
                    <ArrowUpRight size={15} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function LogDialog({
  book: b,
  date,
  now,
  onSave,
  onClose,
}: {
  book: Book;
  date: string;
  now: string;
  onSave: (amount: number, date: string) => Promise<void>;
  onClose: () => void;
}) {
  const [day, setDay] = useState(date),
    [amount, setAmount] = useState(
      Math.max(1, Math.min(b.total - read(b), daily(b, date).left || b.pace)),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={translate("Ещё несколько страниц истории")} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(amount, day);
            onClose();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : translate("Не удалось сохранить."),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="log-title">{b.title}</p>
        <p className="muted">
          {translate("Осталось в книге: ")}
          {b.total - read(b)} {unitLabel(b)}
        </p>
        <label>
          {translate("Дата чтения")}
          <input
            type="date"
            min={b.start}
            max={now}
            required
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <label>
          {b.unit === "pages"
            ? translate("Сколько страниц вы прочитали?")
            : translate("Сколько глав вы прочитали?")}
          <input
            autoFocus
            type="number"
            min="1"
            max={b.total - read(b)}
            step="1"
            required
            value={amount}
            onChange={(e) => setAmount(+e.target.value)}
          />
        </label>
        <div className="quick-amounts">
          {(b.unit === "pages" ? [5, 10, 20, 30] : [1, 2, 3, 5])
            .filter((n) => n <= b.total - read(b))
            .map((n) => (
              <button
                type="button"
                className={amount === n ? "selected" : ""}
                key={n}
                onClick={() => setAmount(n)}
              >
                {n} {unitLabel(b)}
              </button>
            ))}
        </div>
        <p className="hint">
          {translate(
            "Записывайте объём за эту сессию, а не номер последней страницы. Он сначала погасит самые ранние задания.",
          )}
        </p>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onClose}>
            {translate("Отмена")}
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? translate("Сохраняем…") : translate("Сохранить чтение")}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function BookDetail({
  book: b,
  now,
  onClose,
  onEdit,
  onRead,
  onDelete,
  onComplete,
}: {
  book: Book;
  now: string;
  onClose: () => void;
  onEdit: () => void;
  onRead: () => void;
  onDelete: () => Promise<void>;
  onComplete: () => Promise<void>;
}) {
  const [tab, setTab] = useState("plan"),
    [limit, setLimit] = useState(45),
    [confirm, setConfirm] = useState<"delete" | "complete" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const tasks = allocations(b),
    debts = debt(b, now);
  return (
    <Modal title={b.title} onClose={onClose} wide>
      <div className="detail-summary">
        <BookCover book={b} />
        <div>
          <p className="author">{b.author}</p>
          <span className={`status-tag ${b.status}`}>
            {translate(statusNames[b.status])}
          </span>
          <h3>
            {read(b)}{" "}
            <small>
              {translate("из ")}
              {b.total} {unitLabel(b)}
            </small>
          </h3>
          <div className="progress-track">
            <i style={{ width: `${(read(b) / b.total) * 100}%` }} />
          </div>
          <p className="muted">
            {translate("Начало: ")}
            {pretty(b.start, true)}
            {b.completedAt && (
              <>
                <br />
                {translate("Завершена: ")}
                {pretty(b.completedAt, true)}
              </>
            )}
          </p>
          <button className="text-btn" onClick={onEdit}>
            {translate("Изменить настройки")}
            <Settings2 size={14} />
          </button>
        </div>
      </div>
      {debts.length > 0 && (
        <p className="notice">
          {translate("У вас осталось ")}
          {debts.reduce((n, t) => n + t.left, 0)} {unitLabel(b)}{" "}
          {translate(
            "долга. Можно прочитать их сегодня или постепенно наверстать.",
          )}
        </p>
      )}
      <div className="tabs">
        <button
          className={tab === "plan" ? "active" : ""}
          onClick={() => setTab("plan")}
        >
          {translate("План чтения")}
        </button>
        <button
          className={tab === "debt" ? "active" : ""}
          onClick={() => setTab("debt")}
        >
          {translate("Задолженность (")}
          {debts.length})
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          {translate("История")}
        </button>
      </div>
      <div className="detail-list">
        {tab === "history" ? (
          b.entries.length ? (
            [...b.entries]
              .sort((a, c) => c.date.localeCompare(a.date))
              .map((e) => (
                <div className="list-row" key={e.id}>
                  <span>{pretty(e.date, true)}</span>
                  <strong>
                    +{e.amount} {unitLabel(b)}
                  </strong>
                </div>
              ))
          ) : (
            <p className="muted">
              {translate("Записей пока нет. Начальный прогресс: ")}
              {b.initial} {unitLabel(b)}
            </p>
          )
        ) : (
          (tab === "debt" ? debts : tasks).slice(0, limit).map((t) => (
            <div
              className={`list-row ${t.date < now && t.left ? "overdue" : ""}`}
              key={t.date}
            >
              <span>
                {pretty(t.date, true)}
                {t.date === now && <small>{translate(" · Сегодня")}</small>}
              </span>
              <span>
                {t.target} {unitLabel(b)}{" "}
                <small>
                  ·{" "}
                  {t.left === 0
                    ? translate("Выполнено")
                    : translate("осталось {0}", [t.left])}
                </small>
              </span>
            </div>
          ))
        )}
        {tab !== "history" &&
          (tab === "debt" ? debts : tasks).length > limit && (
            <button
              className="btn secondary full"
              onClick={() => setLimit(limit + 60)}
            >
              {translate("Показать ещё 60 дней")}
            </button>
          )}
        {tab === "plan" && !tasks.length && (
          <p className="muted">
            {translate(
              "План появится, когда книга будет на полке «Читаю сейчас» и будут доступны дни для чтения.",
            )}
          </p>
        )}
        {tab === "debt" && !debts.length && (
          <p className="muted">
            {translate("Всё спокойно — задолженностей нет.")}
          </p>
        )}
      </div>
      <div className="detail-actions">
        {b.status !== "completed" && (
          <>
            <button className="btn primary" onClick={onRead}>
              <Plus size={16} />
              {translate("Записать чтение")}
            </button>
            <button className="text-btn" onClick={() => setConfirm("complete")}>
              {translate("Завершить книгу")}
            </button>
          </>
        )}
        <button
          className="text-btn danger"
          onClick={() => setConfirm("delete")}
        >
          {translate("Удалить книгу")}
        </button>
      </div>
      {confirm && (
        <div className="confirm-box">
          <strong>
            {confirm === "delete"
              ? translate("Удалить книгу и всю историю чтения?")
              : translate(
                  "Подтвердить оставшиеся {0} {1} как прочитанные сегодня?",
                  [b.total - read(b), unitLabel(b)],
                )}
          </strong>
          <p className="hint">
            {confirm === "delete"
              ? translate("Вернуть данные можно будет из резервной копии.")
              : translate(
                  "Оставшийся объём будет записан как фактическое чтение. Книга засчитается в цель один раз.",
                )}
          </p>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setConfirm(null)}>
              {translate("Отмена")}
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (confirm === "delete") await onDelete();
                  else await onComplete();
                  setConfirm(null);
                } catch {
                  setError(
                    translate(
                      "Не удалось сохранить изменение. Попробуйте ещё раз.",
                    ),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {translate("Подтвердить")}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </Modal>
  );
}
function Calendar({
  books,
  now,
  onRead,
  onRest,
}: {
  books: Book[];
  now: string;
  onRead: (b: Book, date: string) => void;
  onRest: (b: Book, date: string) => Promise<void>;
}) {
  const [cursor, setCursor] = useState(now),
    [view, setView] = useState<"month" | "week">("month"),
    [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState("");
  const visible =
    filter === "all" ? books : books.filter((b) => b.id === filter);
  const start =
    view === "month"
      ? startOfWeek(startOfMonth(parseISO(cursor)), { weekStartsOn: 1 })
      : startOfWeek(parseISO(cursor), { weekStartsOn: 1 });
  const end =
    view === "month"
      ? endOfWeek(endOfMonth(parseISO(cursor)), { weekStartsOn: 1 })
      : endOfWeek(parseISO(cursor), { weekStartsOn: 1 });
  const dates = [];
  for (let d = dateKey(start); d <= dateKey(end); d = plus(d, 1)) dates.push(d);
  function move(n: number) {
    setCursor(
      view === "month"
        ? dateKey(addMonths(parseISO(cursor), n))
        : plus(cursor, n * 7),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{translate("Календарь чтения")}</h1>
        </div>
        <button className="btn secondary" onClick={() => setCursor(now)}>
          {translate("Сегодня")}
        </button>
      </div>
      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div className="month-switch">
            <button
              className="icon-btn"
              aria-label={translate("Предыдущий период")}
              onClick={() => move(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <h2>
              {format(parseISO(cursor), "LLLL yyyy", {
                locale: getDateLocale(),
              })}
            </h2>
            <button
              className="icon-btn"
              aria-label={translate("Следующий период")}
              onClick={() => move(1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="calendar-controls">
            <select
              aria-label={translate("Книги в календаре")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">{translate("Все книги")}</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
            <div className="segmented">
              <button
                className={view === "month" ? "active" : ""}
                onClick={() => setView("month")}
              >
                {translate("Месяц")}
              </button>
              <button
                className={view === "week" ? "active" : ""}
                onClick={() => setView("week")}
              >
                {translate("Неделя")}
              </button>
            </div>
          </div>
        </div>
        <div className="calendar-weekhead">
          {[
            translate("Пн"),
            translate("Вт"),
            translate("Ср"),
            translate("Чт"),
            translate("Пт"),
            translate("Сб"),
            translate("Вс"),
          ].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className={`calendar-grid ${view}`}>
          {dates.map((d) => {
            const targets = visible.flatMap((b) =>
                allocations(b)
                  .filter((t) => t.date === d)
                  .map((t) => ({ ...t, unit: b.unit })),
              ),
              hasDebt = d < now && targets.some((t) => t.left > 0),
              done =
                targets.some((t) => t.target > 0) &&
                targets.every((t) => t.left === 0),
              hasRead = visible.some((b) => actual(b, d) > 0),
              relevant = visible.filter(
                (b) => b.status === "reading" && b.start <= d,
              ),
              rest = relevant.length > 0 && relevant.every((b) => isRest(b, d));
            return (
              <button
                key={d}
                onClick={() => {
                  setSelected(d);
                  setError("");
                }}
                aria-label={`${pretty(d, true)}${hasDebt ? translate(", есть задолженность") : ""}`}
                className={`calendar-day ${d === now ? "current" : ""} ${hasDebt ? "overdue" : done || hasRead ? "done" : ""} ${d.slice(0, 7) !== cursor.slice(0, 7) && view === "month" ? "outside" : ""}`}
              >
                <span className="day-number">{parseISO(d).getDate()}</span>
                <div className="day-data">
                  {(["pages", "chapters"] as Unit[]).map((u) => {
                    const target = targets
                        .filter((t) => t.unit === u)
                        .reduce((s, t) => s + t.target, 0),
                      fact = visible
                        .filter((b) => b.unit === u)
                        .reduce((s, b) => s + actual(b, d), 0);
                    return target > 0 || fact > 0 ? (
                      <span key={u}>
                        <span className="day-plan">
                          {target}{" "}
                          {u === "pages" ? translate("стр.") : translate("гл.")}
                        </span>
                        <small>
                          {fact > 0
                            ? translate("Прочитано: ") + fact
                            : hasDebt
                              ? translate("Можно наверстать")
                              : d === now
                                ? translate("На сегодня")
                                : translate("По плану")}
                        </small>
                      </span>
                    ) : null;
                  })}
                  {rest && (
                    <span className="day-rest">
                      <Coffee size={14} />
                      <small>{translate("Выходной")}</small>
                    </span>
                  )}
                </div>
                {(done || hasRead) && <Check size={13} className="day-check" />}
              </button>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span>
            <i className="legend-dot sage" />
            {translate("Выполнено")}
          </span>
          <span>
            <i className="legend-dot olive" />
            {translate("Сегодня")}
          </span>
          <span>
            <i className="legend-dot orange" />
            {translate("Можно наверстать")}
          </span>
          <span>
            <i className="legend-dot cream" />
            {translate("Отдых")}
          </span>
        </div>
      </section>
      <p className="hint">
        {translate(
          "Нажмите на дату, чтобы посмотреть план, записать чтение задним числом или запланировать отдых.",
        )}
      </p>
      {selected && (
        <Modal
          title={pretty(selected, true)}
          onClose={() => setSelected(null)}
          wide
        >
          {visible.length ? (
            visible
              .filter((b) => b.start <= selected)
              .map((b) => {
                const t = allocations(b).find((t) => t.date === selected);
                return (
                  <div className="calendar-detail" key={b.id}>
                    <div>
                      <strong>{b.title}</strong>
                      <p className="muted">
                        {translate("План: ")}
                        {t?.target ?? 0} {unitLabel(b)}
                        {translate(" · Факт:")} {actual(b, selected)}{" "}
                        {unitLabel(b)}
                      </p>
                      {t && selected < now && t.left > 0 && (
                        <p className="debt-text">
                          {translate("Осталось от задания: ")}
                          {t.left} {unitLabel(b)}
                        </p>
                      )}
                      {isRest(b, selected) && (
                        <small className="muted">
                          {translate("Выходной от чтения")}
                        </small>
                      )}
                    </div>
                    <div className="calendar-detail-actions">
                      {selected <= now && read(b) < b.total && (
                        <button
                          className="btn primary small"
                          onClick={() => {
                            setSelected(null);
                            onRead(b, selected);
                          }}
                        >
                          <Plus size={15} />
                          {translate("Записать")}
                        </button>
                      )}
                      {selected >= now && b.status === "reading" && (
                        <button
                          className="btn secondary small"
                          onClick={async () => {
                            try {
                              await onRest(b, selected);
                            } catch {
                              setError(
                                translate("Не удалось сохранить выходной."),
                              );
                            }
                          }}
                        >
                          {b.excluded.includes(selected)
                            ? translate("Убрать выходной")
                            : translate("День отдыха")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
          ) : (
            <p className="muted">
              {translate("Добавьте первую книгу — и здесь появится ваш план.")}
            </p>
          )}
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
function Analytics({
  books,
  allBooks,
  year,
  now,
  goal,
}: {
  books: Book[];
  allBooks: Book[];
  year: number;
  now: string;
  goal: number;
}) {
  const [unit, setUnit] = useState<Unit>("pages");
  const volumes = allBooks.filter((b) => b.unit === unit);
  const unitText = unit === "pages" ? translate("стр.") : translate("гл.");
  const logs = volumes
    .flatMap((b) => b.entries)
    .filter((e) => e.date.startsWith(String(year)));
  const days = new Set(
    allBooks.flatMap((b) =>
      b.entries
        .filter((e) => e.date.startsWith(String(year)))
        .map((e) => e.date),
    ),
  );
  const start = dateKey(startOfWeek(parseISO(now), { weekStartsOn: 1 }));
  const weekly = Array.from({ length: 7 }, (_, i) => {
    const d = plus(start, i);
    return {
      date: format(parseISO(d), "EEEEEE", { locale: getDateLocale() }),
      plan: volumes.reduce((s, b) => s + (b.tasks[d] ?? 0), 0),
      actual: volumes.reduce((s, b) => s + actual(b, d), 0),
    };
  });
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const prefix = `${year}-${String(i + 1).padStart(2, "0")}`;
    return {
      name: format(new Date(year, i, 1), "LLL", { locale: getDateLocale() }),
      volume: logs
        .filter((e) => e.date.startsWith(prefix))
        .reduce((s, e) => s + e.amount, 0),
      days: new Set(
        logs.filter((e) => e.date.startsWith(prefix)).map((e) => e.date),
      ).size,
    };
  });
  const done = books.filter((b) => b.status === "completed").length;
  const elapsed = Math.max(
    1,
    Math.min(
      365,
      Math.round(
        (parseISO(now).getTime() - new Date(year, 0, 1).getTime()) / 86400000,
      ) + 1,
    ),
  );
  const prediction =
    year < new Date().getFullYear()
      ? done
      : year > new Date().getFullYear()
        ? 0
        : Math.round((done / elapsed) * 365);
  const heatStart = dateKey(
    startOfWeek(new Date(year, 0, 1), { weekStartsOn: 1 }),
  );
  const heatDays = [];
  for (let d = heatStart; d <= `${year}-12-31`; d = plus(d, 1))
    heatDays.push(d);
  const plannedDays = new Set(
    books
      .flatMap((b) => [
        ...Object.keys(b.tasks),
        ...b.entries.map((e) => e.date),
      ])
      .filter((d) => d.startsWith(String(year)) && d < now),
  );
  const debtFree = [...plannedDays].filter((d) =>
    books.every((b) =>
      allocations(b, d)
        .filter((t) => t.date <= d)
        .every((t) => t.left === 0),
    ),
  ).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{translate("Прогресс")}</h1>
        </div>
        <div className="segmented">
          <button
            className={unit === "pages" ? "active" : ""}
            onClick={() => setUnit("pages")}
          >
            {translate("Страницы")}
          </button>
          <button
            className={unit === "chapters" ? "active" : ""}
            onClick={() => setUnit("chapters")}
          >
            {translate("Главы")}
          </button>
        </div>
      </div>
      <div className="analytics-stats">
        {[
          {
            icon: <Trophy size={20} />,
            value: done,
            label: translate("Завершено книг"),
          },
          {
            icon: <CalendarDays size={20} />,
            value: days.size,
            label: translate("Дней с чтением"),
          },
          {
            icon: <Flame size={20} />,
            value: streak(allBooks, now),
            label: translate("Текущая серия, дней"),
          },
          {
            icon: <BookOpen size={20} />,
            value: logs.reduce((s, e) => s + e.amount, 0),
            label: translate("Прочитано, {0}", [unitText]),
          },
        ].map((s) => (
          <div className="summary-card" key={s.label}>
            <span className="stat-icon">{s.icon}</span>
            <div>
              <p>{s.label}</p>
              <strong>{s.value}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="charts-grid">
        <section className="panel chart-panel">
          <div className="section-heading">
            <h3>{translate("План и факт")}</h3>
            <small className="muted">
              {translate("Текущая неделя · ")}
              {unitText}
            </small>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={weekly}
              barGap={4}
              margin={{ top: 5, right: 8, bottom: 5, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#736F4E22"
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#736F4E", fontSize: 12 }}
              />
              <YAxis
                width={Math.max(
                  24,
                  String(
                    Math.max(
                      1,
                      ...weekly.flatMap((day) => [day.plan, day.actual]),
                    ),
                  ).length *
                    7 +
                    12,
                )}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tick={{ fill: "#736F4E", fontSize: 11 }}
              />
              <Tooltip />
              <Legend iconType="circle" />
              <Bar
                dataKey="plan"
                name={translate("План")}
                fill="#B4C292"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="actual"
                name={translate("Факт")}
                fill="#736F4E"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="panel chart-panel">
          <div className="section-heading">
            <h3>{translate("Книжные месяцы")}</h3>
            <small className="muted">{translate("Дни с чтением")}</small>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={monthly}
              margin={{ top: 5, right: 8, bottom: 5, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#736F4E22"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#736F4E", fontSize: 11 }}
              />
              <YAxis
                width={28}
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#736F4E", fontSize: 11 }}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="days"
                name={translate("Дни")}
                stroke="#736F4E"
                strokeWidth={2.5}
                dot={{ fill: "#B4C292", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </div>
      <section className="panel heatmap-panel">
        <div className="section-heading">
          <h3>{translate("Год маленьких шагов")}</h3>
          <small className="muted">
            {translate("Дни с чтением · ")}
            {year}
          </small>
        </div>
        <div className="heatmap-scroll">
          <div className="heatmap">
            {heatDays.map((d) => {
              const value = logs
                .filter((e) => e.date === d)
                .reduce((s, e) => s + e.amount, 0);
              return (
                <div
                  key={d}
                  tabIndex={0}
                  aria-label={`${pretty(d)}: ${value} ${unitText}`}
                  title={`${pretty(d)}: ${value} ${unitText}`}
                  className={`heat-cell level-${value === 0 ? 0 : value < (unit === "pages" ? 10 : 2) ? 1 : value < (unit === "pages" ? 25 : 4) ? 2 : 3} ${d.startsWith(String(year)) ? "" : "invisible"}`}
                />
              );
            })}
          </div>
        </div>
        <div className="heatmap-legend">
          <small>{translate("Меньше")}</small>
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={`heat-cell level-${i}`} />
          ))}
          <small>{translate("Больше")}</small>
        </div>
      </section>
      <div className="charts-grid">
        <section className="panel book-rings">
          <h3>{translate("Прогресс ваших историй")}</h3>
          {books.length ? (
            <div className="ring-list">
              {books
                .filter((b) => b.status !== "wishlist")
                .map((b) => (
                  <div key={b.id}>
                    <ProgressRing value={(read(b) / b.total) * 100} size={85} />
                    <strong>{b.title}</strong>
                    <small className="muted">
                      {read(b)} / {b.total} {unitLabel(b)}
                    </small>
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted">
              {translate("Здесь появится прогресс добавленных книг.")}
            </p>
          )}
        </section>
        <section className="panel insights">
          <h3>{translate("В своём ритме")}</h3>
          <div className="list-row">
            <span>{translate("Годовая цель")}</span>
            <strong>
              {done} / {goal}
              {translate(" книг")}
            </strong>
          </div>
          <div className="progress-track">
            <i style={{ width: `${Math.min(100, (done / goal) * 100)}%` }} />
          </div>
          <div className="list-row">
            <span>{translate("Завершённые дни без долгов")}</span>
            <strong>{debtFree}</strong>
          </div>
          <div className="list-row">
            <span>{translate("Прогноз к концу года")}</span>
            <strong>
              {prediction}
              {translate(" книг")}
            </strong>
          </div>
          <p className="hint">
            {translate(
              "Прогноз основан на числе завершённых книг и прошедших днях года. Страницы и главы считаются отдельно.",
            )}
          </p>
        </section>
      </div>
    </>
  );
}
function Goals({
  books,
  year,
  goal,
  onGoal,
  onPlan,
  addButton,
}: {
  books: Book[];
  year: number;
  goal: number;
  onGoal: (n: number) => Promise<void>;
  onPlan: (b: Book) => void;
  addButton: ReactNode;
}) {
  const [value, setValue] = useState(goal),
    [busy, setBusy] = useState(false);
  useEffect(() => setValue(goal), [goal]);
  const completed = books.filter((b) => b.status === "completed");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{translate("Цели на {0} год", [year])}</h1>
        </div>
        {addButton}
      </div>
      <section className="panel goal-hero">
        <ProgressRing size={190} value={(completed.length / goal) * 100}>
          <strong>
            {Math.round((completed.length / goal) * 100)}
            <small>%</small>
          </strong>
          <span>{translate("годовой цели")}</span>
        </ProgressRing>
        <div>
          <h2>
            {translate("{0} из {1} историй уже с вами", [
              completed.length,
              goal,
            ])}
          </h2>
          <p className="muted">
            {translate("В библиотеке: ")}
            {books.length}
            {translate(" · Осталось до цели:")}{" "}
            {Math.max(0, goal - completed.length)}
          </p>
          <form
            className="goal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onGoal(value);
              } catch {
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              {translate("Моя цель на год")}
              <input
                aria-label={translate("Количество книг на год")}
                type="number"
                required
                min="1"
                max="1000000"
                value={value}
                onChange={(e) => setValue(+e.target.value)}
              />
            </label>
            <button className="btn primary" disabled={busy}>
              {translate("Сохранить цель")}
            </button>
          </form>
        </div>
      </section>
      <div className="section-heading">
        <h2>{translate("Истории, которые вы прочитали")}</h2>
        <Trophy size={22} />
      </div>
      {completed.length ? (
        <div className="completed-grid">
          {completed.map((b) => (
            <button
              className="panel completed-card"
              key={b.id}
              onClick={() => onPlan(b)}
            >
              <BookCover book={b} />
              <div>
                <span className="tag">{translate("КНИГА ЗАВЕРШЕНА")}</span>
                <h3>{b.title}</h3>
                <p className="muted">{b.author}</p>
                <small>{b.completedAt && pretty(b.completedAt, true)}</small>
              </div>
              <Check size={22} />
            </button>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty title={translate("Впереди — целая полка открытий")}>
            {translate("Завершённые книги будут появляться здесь.")}
            <br />
            {translate("Каждая из них засчитывается в цель ровно один раз.")}
          </Empty>
        </div>
      )}
    </>
  );
}
function SettingsPage({
  account,
  data,
  year,
  install,
  onInstall,
  onChange,
  onImport,
  onError,
}: {
  account: AccountLibrary;
  data: Data;
  year: number;
  install: InstallEvent | null;
  onInstall: () => Promise<void>;
  onChange: (s: Data["settings"]) => Promise<void>;
  onImport: (d: Data) => Promise<void>;
  onError: (s: string) => void;
}) {
  const [settings, setSettings] = useState(data.settings),
    [goal, setGoal] = useState(data.settings.goals[year] ?? 20),
    [backup, setBackup] = useState<Data | null>(null),
    [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setSettings(data.settings);
    setGoal(data.settings.goals[year] ?? 20);
  }, [data.settings, year]);
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `my-book-year-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function selectFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error(translate("Размер файла превышает 50 МБ."));
      setBackup(parseBackup(await file.text()));
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : translate("Не удалось прочитать файл."),
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{translate("Настройки")}</h1>
        </div>
      </div>
      <AccountPanel account={account} />
      <section className="panel settings-panel language-panel">
        <LanguagePicker />
      </section>
      <div className="settings-layout">
        <form
          className="panel settings-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onChange({
                ...settings,
                goals: { ...settings.goals, [year]: goal },
              });
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="section-heading">
            <h3>
              <Target size={19} />
              {translate("Ваши предпочтения")}
            </h3>
          </div>
          <label>
            {translate("Годовая цель на {0} год, книг", [year])}
            <input
              type="number"
              min="1"
              max="1000000"
              required
              value={goal}
              onChange={(e) => setGoal(+e.target.value)}
            />
          </label>
          <label>{translate("Выходные по умолчанию")}</label>
          <RestPicker
            value={settings.restDays}
            onChange={(restDays) => setSettings({ ...settings, restDays })}
          />
          <p className="hint">
            {translate(
              "Используются для новых книг. Выходные существующей книги меняются в её настройках.",
            )}
          </p>

          <label>
            {translate("Режим по умолчанию")}
            <select
              value={settings.mode}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  mode: e.target.value as Book["mode"],
                })
              }
            >
              <option value="deadline">
                {translate("Распределить до даты")}
              </option>
              <option value="pace">{translate("Читать в своём темпе")}</option>
            </select>
          </label>
          <button className="btn primary" disabled={busy}>
            {translate("Сохранить настройки")}
            <Check size={16} />
          </button>
        </form>
        <div className="settings-stack">
          <section className="panel settings-panel">
            <h3>
              <Download size={19} />
              {translate("Резервная копия")}
            </h3>
            <p className="muted">
              {translate(
                "Дополнительная копия всех книг и настроек в файле. Можно сохранить её или восстановить библиотеку из ранее скачанного файла.",
              )}
            </p>
            <div className="button-row">
              <button className="btn secondary" onClick={exportData}>
                <Download size={16} />
                {translate("Экспорт JSON")}
              </button>
              <button
                className="btn secondary"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={16} />
                {translate("Импорт JSON")}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => selectFile(e.target.files?.[0])}
              />
            </div>
          </section>
          <section className="panel settings-panel install-panel">
            <h3>
              <BookMarked size={19} />
              {translate("Ваша библиотека всегда рядом")}
            </h3>
            <p className="muted">
              {translate(
                "Установите приложение на главный экран и читайте свой план даже без интернета.",
              )}
            </p>
            {install ? (
              <button
                className="btn primary"
                onClick={() =>
                  onInstall().catch(() =>
                    onError(
                      translate(
                        "Установка не завершена. Попробуйте через меню браузера.",
                      ),
                    ),
                  )
                }
              >
                <Download size={16} />
                {translate("Установить приложение")}
              </button>
            ) : (
              <p className="hint">
                {translate(
                  "Android: Chrome → ⋮ → «Добавить на главный экран». iPhone: Safari → «Поделиться» → «На экран Домой».",
                )}
              </p>
            )}
          </section>
        </div>
      </div>
      <details className="panel help-panel">
        <summary>
          <CircleHelp size={19} />
          {translate("Как пользоваться")}
        </summary>
        <div className="help-grid">
          <div>
            <span>01</span>
            <strong>{translate("Добавьте книгу")}</strong>
            <p>
              {translate(
                "Название, объём, удобный ритм. Всё остальное мы посчитаем.",
              )}
            </p>
          </div>
          <div>
            <span>02</span>
            <strong>{translate("Читайте в удовольствие")}</strong>
            <p>
              {translate(
                "Смотрите задание на сегодня и записывайте фактический объём чтения.",
              )}
            </p>
          </div>
          <div>
            <span>03</span>
            <strong>{translate("Не переживайте о пропусках")}</strong>
            <p>
              {translate(
                "Дополнительное чтение сначала погашает старые задания, затем новые.",
              )}
            </p>
          </div>
          <div>
            <span>04</span>
            <strong>{translate("Сохраняйте свои истории")}</strong>
            <p>
              {translate(
                "Следите за прогрессом и регулярно экспортируйте резервную копию.",
              )}
            </p>
          </div>
        </div>
      </details>
      {backup && (
        <Modal
          title={translate("Восстановить резервную копию?")}
          onClose={() => setBackup(null)}
        >
          <p>
            {translate(
              "В файле: {0} книг. Текущая библиотека будет полностью заменена данными из файла.",
              [backup.books.length],
            )}
          </p>
          <p className="notice">
            {translate(
              "Сначала экспортируйте текущие данные, если хотите сохранить их.",
            )}
          </p>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setBackup(null)}>
              {translate("Отмена")}
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onImport(backup);
                  setBackup(null);
                } catch {
                } finally {
                  setBusy(false);
                }
              }}
            >
              {translate("Заменить и восстановить")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function DebtSummary({
  books,
  now,
  onOpen,
}: {
  books: Book[];
  now: string;
  onOpen: () => void;
}) {
  const values = (unit: Unit) =>
    books
      .filter((b) => b.unit === unit)
      .reduce((s, b) => s + debt(b, now).reduce((n, t) => n + t.left, 0), 0);
  const pages = values("pages"),
    chapters = values("chapters");
  if (!pages && !chapters) return null;
  return (
    <div className="debt-summary">
      <Coffee size={20} />
      <div>
        <strong>
          {translate("Можно постепенно наверстать:")}{" "}
          {[
            pages ? translate("{0} стр.", [pages]) : "",
            chapters ? translate("{0} гл.", [chapters]) : "",
          ]
            .filter(Boolean)
            .join(translate(" и "))}
        </strong>
        <p>
          {translate(
            "Это непогашенные задания за прошлые дни. Дополнительное чтение зачтётся в них первым.",
          )}
        </p>
      </div>
      <button className="text-btn" onClick={onOpen}>
        {translate("Посмотреть даты")}
        <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
