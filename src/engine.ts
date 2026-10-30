import { addDays, format, parseISO, differenceInCalendarDays } from "date-fns";
import type { Book, Entry } from "./types";
// Completed books belong to their actual completion year; plans keep their chosen year.
export const bookYear = (b: Book) =>
  b.status === "completed" && b.completedAt
    ? Number(b.completedAt.slice(0, 4))
    : b.year;
export const today = () => format(new Date(), "yyyy-MM-dd");
export const dateKey = (date: Date) => format(date, "yyyy-MM-dd");
export const plus = (date: string, days: number) =>
  dateKey(addDays(parseISO(date), days));
export const pretty = (date: string, full = false) =>
  parseISO(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(full ? { year: "numeric" as const } : {}),
  });
export const isRest = (b: Book, date: string) =>
  b.restDays.includes(parseISO(date).getDay()) || b.excluded.includes(date);
export const read = (b: Book, at = "9999-12-31") =>
  Math.min(
    b.total,
    b.initial +
      b.entries.filter((e) => e.date <= at).reduce((n, e) => n + e.amount, 0),
  );
export const actual = (b: Book, date: string) =>
  b.entries.filter((e) => e.date === date).reduce((n, e) => n + e.amount, 0);
export function available(b: Book, start: string, end: string) {
  const result: string[] = [];
  for (let d = start; d <= end; d = plus(d, 1))
    if (!isRest(b, d)) result.push(d);
  return result;
}
// Integer error diffusion distributes the remainder evenly; the sum is exact.
export function distribute(
  volume: number,
  days: string[],
): Record<string, number> {
  return Object.fromEntries(
    days.map((d, i) => [
      d,
      Math.floor(((i + 1) * volume) / days.length) -
        Math.floor((i * volume) / days.length),
    ]),
  );
}
// Elapsed targets are immutable. Extra reading is credit against the earliest
// outstanding target, including future targets, and is never counted twice.
export function schedule(b: Book, from = today()): Book {
  const tasks = Object.fromEntries(
    Object.entries(b.tasks).filter(([d]) => d < from),
  );
  if (b.status !== "reading") return { ...b, tasks };
  const volume = Math.max(
    0,
    b.total - b.initial - Object.values(tasks).reduce((n, v) => n + v, 0),
  );
  const start = b.start > from ? b.start : from;
  if (b.mode === "deadline")
    Object.assign(tasks, distribute(volume, available(b, start, b.deadline)));
  else if (b.restDays.length < 7) {
    let left = volume;
    for (
      let d = start, guard = 0;
      left > 0 && guard < 36600;
      d = plus(d, 1), guard++
    ) {
      if (isRest(b, d)) continue;
      tasks[d] = Math.min(left, b.pace);
      left -= tasks[d];
    }
  }
  return { ...b, tasks };
}
export function allocations(b: Book, at = "9999-12-31") {
  let credit = read(b, at) - b.initial;
  return Object.entries(b.tasks)
    .sort(([a], [c]) => a.localeCompare(c))
    .map(([date, target]) => {
      const paid = Math.min(credit, target);
      credit -= paid;
      return { date, target, paid, left: target - paid };
    });
}
export function debt(b: Book, at = today()) {
  return allocations(b, at).filter((t) => t.date < at && t.left > 0);
}
export function daily(b: Book, date = today()) {
  return (
    allocations(b, date).find((t) => t.date === date) ?? {
      date,
      target: 0,
      paid: 0,
      left: 0,
    }
  );
}
export function forecast(b: Book, at = today()) {
  if (read(b) >= b.total) return b.completedAt ?? at;
  const future = allocations(b).filter((t) => t.left > 0 && t.date >= at);
  // Overdue deadline targets still need real reading; offer a practical pace.
  const left = b.total - read(b);
  const loggedDays = new Set(b.entries.map((e) => e.date)).size;
  const pace =
    b.mode === "pace"
      ? b.pace
      : loggedDays
        ? Math.max(1, Math.round((read(b) - b.initial) / loggedDays))
        : b.pace;
  if (b.mode === "pace" || loggedDays || !future.length) {
    let remaining = left;
    if (b.restDays.length === 7) return undefined;
    for (let d = at, guard = 0; guard < 36600; d = plus(d, 1), guard++)
      if (!isRest(b, d)) {
        remaining -= pace;
        if (remaining <= 0) return d;
      }
    return undefined;
  }
  return future.at(-1)?.date;
}
export function record(
  b: Book,
  amount: number,
  date: string,
  now = today(),
): Book {
  if (!Number.isInteger(amount) || amount <= 0)
    throw new Error("Введите целое число больше нуля.");
  if (date < b.start || date > now)
    throw new Error(
      "Дата записи должна быть между началом чтения и сегодняшним днём.",
    );
  if (amount > b.total - read(b))
    throw new Error("Это больше оставшегося объёма книги.");
  const entry: Entry = { id: crypto.randomUUID(), date, amount };
  const next = { ...b, entries: [...b.entries, entry] };
  if (read(next) === b.total)
    return {
      ...next,
      status: "completed",
      completedAt:
        [...next.entries].sort((a, c) => a.date.localeCompare(c.date)).at(-1)
          ?.date ?? date,
    };
  return next;
}
export function streak(books: Book[], at = today()) {
  const starts = books.map((b) => b.start).sort();
  if (!starts.length) return 0;
  let n = 0;
  for (let d = at; d >= starts[0]; d = plus(d, -1)) {
    if (books.some((b) => actual(b, d) > 0)) {
      n++;
      continue;
    }
    const relevant = books.filter(
      (b) =>
        b.start <= d &&
        (!b.completedAt || b.completedAt >= d) &&
        b.status !== "wishlist",
    );
    if (d === at || (relevant.length && relevant.every((b) => isRest(b, d))))
      continue;
    break;
  }
  return n;
}
export const daysBetween = (a: string, b: string) =>
  differenceInCalendarDays(parseISO(b), parseISO(a));
