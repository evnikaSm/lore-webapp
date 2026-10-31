import { translate } from "./i18n";
import Dexie, { type Table } from "dexie";
import type { Data, Book, Settings } from "./types";
import { defaultSettings } from "./types";
import { emptyCache, type Cache, type CacheRepository } from "./sync";
class Library extends Dexie {
  accounts!: Table<Cache, string>;
  state!: Table<{ id: string; value: Data }, string>;
  constructor() {
    super("my-book-year");
    this.version(1).stores({ state: "id" });
    this.version(2).stores({ state: "id", accounts: "id" });
  }
}
const db = new Library();
export async function load(): Promise<Data> {
  return (
    (await db.state.get("library"))?.value ?? {
      version: 1,
      books: [],
      settings: defaultSettings,
    }
  );
}
export async function save(value: Data) {
  await db.state.put({ id: "library", value });
}
const date = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !isNaN(new Date(v + "T12:00:00").getTime()) &&
  new Date(v + "T12:00:00").toISOString().slice(0, 10) === v;
const integer = (v: unknown, min = 0): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= 1000000;
const rest = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.length <= 7 &&
  new Set(v).size === v.length &&
  v.every((n) => integer(n) && n <= 6);
function checkSettings(s: Settings) {
  return (
    s &&
    typeof s.goals === "object" &&
    s.goals !== null &&
    Object.entries(s.goals).every(
      ([y, n]) => /^\d{4}$/.test(y) && integer(n, 1),
    ) &&
    rest(s.restDays) &&
    ["pages", "chapters"].includes(s.unit) &&
    ["deadline", "pace"].includes(s.mode) &&
    integer(s.pace, 1)
  );
}
function checkBook(b: Book) {
  return (
    b &&
    typeof b.id === "string" &&
    b.id.length > 0 &&
    typeof b.title === "string" &&
    b.title.trim().length > 0 &&
    typeof b.author === "string" &&
    (!b.cover ||
      (typeof b.cover === "string" &&
        /^data:image\/(png|jpeg|webp|gif);base64,/.test(b.cover))) &&
    integer(b.total, 1) &&
    integer(b.pages) &&
    integer(b.initial) &&
    b.initial <= b.total &&
    ["pages", "chapters"].includes(b.unit) &&
    ["deadline", "pace"].includes(b.mode) &&
    ["reading", "wishlist", "paused", "completed"].includes(b.status) &&
    integer(b.pace, 1) &&
    date(b.start) &&
    date(b.deadline) &&
    b.deadline >= b.start &&
    integer(b.year, 1900) &&
    b.year <= 9999 &&
    rest(b.restDays) &&
    Array.isArray(b.excluded) &&
    b.excluded.every(date) &&
    typeof b.tasks === "object" &&
    b.tasks !== null &&
    Object.entries(b.tasks).every(
      ([d, n]) => date(d) && d >= b.start && integer(n),
    ) &&
    Object.values(b.tasks).reduce((a, n) => a + n, 0) <= b.total - b.initial &&
    Array.isArray(b.entries) &&
    b.entries.every(
      (e) =>
        typeof e.id === "string" &&
        date(e.date) &&
        e.date >= b.start &&
        integer(e.amount, 1),
    ) &&
    new Set(b.entries.map((e) => e.id)).size === b.entries.length &&
    b.entries.reduce((a, e) => a + e.amount, b.initial) <= b.total &&
    (b.status !== "completed" ||
      (b.entries.reduce((a, e) => a + e.amount, b.initial) === b.total &&
        date(b.completedAt))) &&
    (!b.completedAt || date(b.completedAt))
  );
}
export function parseBackup(text: string): Data {
  const d = JSON.parse(text) as Data;
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.books) ||
    !checkSettings(d.settings) ||
    !d.books.every(checkBook) ||
    new Set(d.books.map((b) => b.id)).size !== d.books.length
  )
    throw new Error(
      translate(
        "Файл не является корректной резервной копией «Моего книжного года».",
      ),
    );
  return { version: 1, books: d.books, settings: d.settings };
}

export const cacheRepository: CacheRepository = {
  async read(owner) {
    const cached = await db.accounts.get(owner ?? "guest");
    if (cached) return cached;
    const empty = emptyCache(owner);
    if (!owner) empty.value = await load();
    return empty;
  },
  async transact(owner, update) {
    return db.transaction("rw", db.state, db.accounts, async () => {
      const current = await cacheRepository.read(owner);
      const next = update(current);
      if (next.id !== (owner ?? "guest"))
        throw new Error("Invalid cache owner");
      await db.accounts.put(next);
      if (!owner) await db.state.put({ id: "library", value: next.value });
      return next;
    });
  },
};
