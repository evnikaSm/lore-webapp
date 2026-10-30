import { describe, expect, it } from "vitest";
import { allocations, schedule, record, debt } from "../src/engine";
import type { Book } from "../src/types";
const book: Book = {
  id: "a",
  title: "a",
  author: "",
  total: 237,
  pages: 237,
  initial: 17,
  unit: "pages",
  mode: "pace",
  pace: 13,
  start: "2026-10-01",
  deadline: "2026-12-31",
  year: 2026,
  restDays: [0, 6],
  excluded: ["2026-10-09"],
  status: "reading",
  tasks: {},
  entries: [],
};
describe("Инварианты плана при последовательных изменениях", () => {
  it("сохраняет объём и историю при чередовании пропусков, чтения и смены режима", () => {
    let b = schedule(book, "2026-10-01");
    for (let day = 1; day <= 23; day++) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      if (day % 3 === 0) b = record(b, 5, date, "2026-10-30");
      const prior = Object.fromEntries(
        Object.entries(b.tasks).filter(([d]) => d < date),
      );
      const before = debt(b, date);
      b = schedule(
        {
          ...b,
          mode: day % 2 ? "deadline" : "pace",
          pace: day + 1,
          deadline: "2026-12-31",
        },
        date,
      );
      for (const [d, v] of Object.entries(prior)) expect(b.tasks[d]).toBe(v);
      expect(debt(b, date)).toEqual(before);
      const a = allocations(b);
      expect(a.reduce((n, t) => n + t.target, 0)).toBe(b.total - b.initial);
      expect(
        a.reduce((n, t) => n + t.left, 0) +
          b.entries.reduce((n, e) => n + e.amount, 0) +
          b.initial,
      ).toBe(b.total);
    }
  });
});
