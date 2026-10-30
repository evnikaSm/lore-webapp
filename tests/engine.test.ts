import { describe, expect, it } from "vitest";
import {
  available,
  distribute,
  schedule,
  allocations,
  debt,
  daily,
  record,
  read,
  forecast,
  streak,
  plus,
} from "../src/engine";
import type { Book } from "../src/types";
const base = (changes: Partial<Book> = {}): Book => ({
  id: "book",
  title: "Книга",
  author: "",
  total: 100,
  pages: 100,
  initial: 0,
  unit: "pages",
  mode: "pace",
  pace: 10,
  start: "2026-10-01",
  deadline: "2026-10-31",
  year: 2026,
  restDays: [],
  excluded: [],
  status: "reading",
  tasks: {},
  entries: [],
  ...changes,
});
const owed = (b: Book, d: string) => debt(b, d).reduce((n, t) => n + t.left, 0);
describe("Распределение", () => {
  it("делит без остатка", () =>
    expect(Object.values(distribute(100, ["a", "b", "c", "d"]))).toEqual([
      25, 25, 25, 25,
    ]));
  it("равномерно распределяет целые страницы и главы", () => {
    for (let amount = 0; amount < 120; amount++)
      for (let n = 1; n < 22; n++) {
        const v = Object.values(
          distribute(
            amount,
            Array.from({ length: n }, (_, i) => String(i)),
          ),
        );
        expect(v.reduce((a, b) => a + b, 0)).toBe(amount);
        expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1);
        expect(v.every(Number.isInteger)).toBe(true);
      }
  });
  it("без доступных дат не делит на ноль", () =>
    expect(distribute(10, [])).toEqual({}));
  it("учитывает регулярные и разовые выходные", () =>
    expect(
      available(
        base({ restDays: [0, 6], excluded: ["2026-10-02"] }),
        "2026-10-01",
        "2026-10-05",
      ),
    ).toEqual(["2026-10-01", "2026-10-05"]));
  it("корректно проходит смену года", () =>
    expect(available(base(), "2026-12-30", "2027-01-02")).toHaveLength(4));
  it("использует календарные дни при переводе часов", () =>
    expect(plus("2026-10-25", 1)).toBe("2026-10-26"));
  it("учитывает начальный прогресс и последний неполный день", () =>
    expect(
      Object.values(
        schedule(base({ total: 34, initial: 10 }), "2026-10-01").tasks,
      ),
    ).toEqual([10, 10, 4]));
  it("автоматический план начинается не раньше даты начала", () => {
    const b = schedule(
      base({ mode: "deadline", start: "2026-10-20" }),
      "2026-10-01",
    );
    expect(Object.keys(b.tasks)[0]).toBe("2026-10-20");
    expect(Object.values(b.tasks).reduce((a, c) => a + c, 0)).toBe(100);
  });
  it("не создаёт план при всех выходных", () =>
    expect(
      schedule(base({ restDays: [0, 1, 2, 3, 4, 5, 6] }), "2026-10-01").tasks,
    ).toEqual({}));
  it("нет дней до дедлайна", () =>
    expect(schedule(base({ mode: "deadline" }), "2026-11-01").tasks).toEqual(
      {},
    ));
  it("план приостановленной книги не создаёт новые долги", () =>
    expect(schedule(base({ status: "paused" }), "2026-10-01").tasks).toEqual(
      {},
    ));
});
describe("Долги и фактическое чтение", () => {
  it("долг появляется только после завершения дня", () => {
    const b = schedule(base(), "2026-10-01");
    expect(owed(b, "2026-10-01")).toBe(0);
    expect(owed(b, "2026-10-02")).toBe(10);
    expect(owed(b, "2026-10-04")).toBe(30);
  });
  it("неполный день и несколько пропусков суммируются", () => {
    const b = record(
      schedule(base(), "2026-10-01"),
      4,
      "2026-10-01",
      "2026-10-04",
    );
    expect(owed(b, "2026-10-04")).toBe(26);
    expect(read(b)).toBe(4);
  });
  it("погашает сначала самый старый долг, затем сегодняшний", () => {
    let b = schedule(base(), "2026-10-01");
    b = record(b, 15, "2026-10-03", "2026-10-03");
    expect(debt(b, "2026-10-03")).toEqual([
      { date: "2026-10-02", target: 10, paid: 5, left: 5 },
    ]);
    expect(daily(b, "2026-10-03").paid).toBe(0);
    b = record(b, 8, "2026-10-03", "2026-10-03");
    expect(owed(b, "2026-10-03")).toBe(0);
    expect(daily(b, "2026-10-03").paid).toBe(3);
    expect(read(b)).toBe(23);
  });
  it("перевыполнение учитывается один раз и даёт кредит будущим датам", () => {
    const b = record(
      schedule(base(), "2026-10-01"),
      35,
      "2026-10-01",
      "2026-10-01",
    );
    expect(allocations(b).reduce((n, t) => n + t.paid, 0)).toBe(35);
    expect(allocations(b).reduce((n, t) => n + t.left, 0)).toBe(65);
    expect(owed(b, "2026-10-04")).toBe(0);
  });
  it("в выходной нет обязательства, но чтение засчитывается", () => {
    const b = record(
      schedule(base({ restDays: [0, 6] }), "2026-10-01"),
      15,
      "2026-10-04",
      "2026-10-04",
    );
    expect(b.tasks["2026-10-04"]).toBeUndefined();
    expect(read(b)).toBe(15);
    expect(owed(b, "2026-10-04")).toBe(5);
  });
  it("запись задним числом пересчитывает долги и исторические показатели", () => {
    const b = record(
      schedule(base(), "2026-10-01"),
      20,
      "2026-10-01",
      "2026-10-04",
    );
    expect(owed(b, "2026-10-04")).toBe(10);
    expect(read(b, "2026-10-01")).toBe(20);
  });
  it("будущая запись не оплачивает исторический долг заранее", () => {
    const b = record(
      schedule(base(), "2026-10-01"),
      20,
      "2026-10-04",
      "2026-10-04",
    );
    expect(owed(b, "2026-10-03")).toBe(20);
  });
  it("новый дедлайн и норма сохраняют старые задания и историю", () => {
    let b = record(
      schedule(base(), "2026-10-01"),
      4,
      "2026-10-01",
      "2026-10-04",
    );
    const entries = b.entries;
    b = schedule(
      { ...b, mode: "deadline", deadline: "2026-10-20" },
      "2026-10-04",
    );
    expect(b.tasks["2026-10-01"]).toBe(10);
    expect(owed(b, "2026-10-04")).toBe(26);
    expect(b.entries).toBe(entries);
    expect(allocations(b).reduce((n, t) => n + t.left, 0)).toBe(96);
    b = schedule({ ...b, mode: "pace", pace: 7 }, "2026-10-04");
    expect(owed(b, "2026-10-04")).toBe(26);
    expect(b.tasks["2026-10-04"]).toBe(7);
  });
  it("чтение с опережением и пересчёт не дублируют оставшиеся страницы", () => {
    const b = record(
      schedule(base(), "2026-10-01"),
      50,
      "2026-10-01",
      "2026-10-03",
    );
    const next = schedule({ ...b, pace: 5 }, "2026-10-03");
    expect(allocations(next).reduce((n, t) => n + t.left, 0)).toBe(50);
    expect(owed(next, "2026-10-03")).toBe(0);
  });
  it("приостановка и возобновление сохраняют прошлый долг", () => {
    const b = schedule(base(), "2026-10-01"),
      paused = schedule({ ...b, status: "paused" }, "2026-10-03");
    expect(Object.keys(paused.tasks)).toHaveLength(2);
    const resumed = schedule({ ...paused, status: "reading" }, "2026-10-08");
    expect(resumed.tasks["2026-10-07"]).toBeUndefined();
    expect(owed(resumed, "2026-10-08")).toBe(20);
  });
  it("не смешивает независимые книги", () => {
    const a = record(
        schedule(base(), "2026-10-01"),
        10,
        "2026-10-01",
        "2026-10-03",
      ),
      b = schedule(base({ id: "second", unit: "chapters" }), "2026-10-01");
    expect(owed(a, "2026-10-03")).toBe(10);
    expect(owed(b, "2026-10-03")).toBe(20);
  });
  it.each([0, -1, 1.5, NaN, Infinity])("отклоняет недопустимый объём %s", (n) =>
    expect(() => record(base(), n, "2026-10-01", "2026-10-01")).toThrow(),
  );
  it("отклоняет переполнение и неверные даты", () => {
    expect(() => record(base(), 101, "2026-10-01", "2026-10-01")).toThrow();
    expect(() => record(base(), 1, "2026-09-30", "2026-10-01")).toThrow();
    expect(() => record(base(), 1, "2026-10-02", "2026-10-01")).toThrow();
  });
});
describe("Завершение, прогноз, привычка", () => {
  it("завершает ровно один раз и погашает долг реальным чтением", () => {
    let b = record(
      schedule(base(), "2026-10-01"),
      100,
      "2026-10-09",
      "2026-10-09",
    );
    expect(b.status).toBe("completed");
    expect(b.completedAt).toBe("2026-10-09");
    expect(owed(b, "2026-10-20")).toBe(0);
    expect(allocations(b).every((t) => t.left === 0)).toBe(true);
    expect(() => record(b, 1, "2026-10-09", "2026-10-09")).toThrow();
    b = schedule(b, "2026-10-09");
    expect(owed(b, "2026-10-20")).toBe(0);
  });
  it("последняя запись задним числом не сдвигает завершение раньше поздних записей", () => {
    let b = record(base(), 50, "2026-10-04", "2026-10-05");
    b = record(b, 50, "2026-10-02", "2026-10-05");
    expect(b.completedAt).toBe("2026-10-04");
  });
  it("прогноз учитывает выходные", () =>
    expect(
      forecast(
        schedule(base({ total: 30, restDays: [0, 6] }), "2026-10-02"),
        "2026-10-02",
      ),
    ).toBe("2026-10-06"));
  it("нет прогноза, если читать невозможно", () =>
    expect(
      forecast(base({ restDays: [0, 1, 2, 3, 4, 5, 6] }), "2026-10-01"),
    ).toBeUndefined());
  it("серия не обнуляется в регулярные выходные", () => {
    let b = record(base({ restDays: [0, 6] }), 10, "2026-10-02", "2026-10-05");
    b = record(b, 10, "2026-10-05", "2026-10-05");
    expect(streak([b], "2026-10-05")).toBe(2);
  });
  it("пропуск рабочего дня обрывает серию", () => {
    let b = record(base(), 10, "2026-10-01", "2026-10-03");
    b = record(b, 10, "2026-10-03", "2026-10-03");
    expect(streak([b], "2026-10-03")).toBe(1);
  });
});
