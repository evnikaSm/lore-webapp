import { describe, it, expect } from "vitest";
import { bookYear, record } from "../src/engine";
import type { Book } from "../src/types";
const book: Book = {
  id: "year",
  title: "На рубеже года",
  author: "",
  total: 20,
  pages: 20,
  initial: 0,
  unit: "pages",
  mode: "pace",
  pace: 10,
  start: "2026-12-30",
  deadline: "2026-12-31",
  year: 2026,
  restDays: [],
  excluded: [],
  status: "reading",
  tasks: {},
  entries: [],
};
describe("Год фактического завершения", () => {
  it("учитывает начатую в декабре книгу только в году окончания", () => {
    const started = record(book, 10, "2026-12-31", "2027-01-02");
    expect(bookYear(started)).toBe(2026);
    const completed = record(started, 10, "2027-01-02", "2027-01-02");
    expect(completed.year).toBe(2026);
    expect(bookYear(completed)).toBe(2027);
    expect(
      [completed].filter(
        (b) => bookYear(b) === 2026 && b.status === "completed",
      ),
    ).toHaveLength(0);
    expect(
      [completed].filter(
        (b) => bookYear(b) === 2027 && b.status === "completed",
      ),
    ).toHaveLength(1);
  });
  it("запись завершения задним числом использует дату чтения", () => {
    const completed = record(book, 20, "2026-12-31", "2027-01-02");
    expect(bookYear(completed)).toBe(2026);
  });
  it("исправляет учёт сохранённых и импортированных книг без изменения данных", () => {
    const restored = {
      ...book,
      status: "completed" as const,
      completedAt: "2027-01-01",
    };
    expect(bookYear(restored)).toBe(2027);
    expect(restored.year).toBe(2026);
  });
});
