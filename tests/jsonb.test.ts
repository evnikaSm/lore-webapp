import { describe, it, expect } from "vitest";
import { equivalent, emptyData, hasData, mergeGuest } from "../src/sync";
import type { Book } from "../src/types";
const b: Book = {
  id: "b",
  title: "Книга",
  author: "",
  total: 10,
  pages: 10,
  initial: 0,
  unit: "pages",
  mode: "pace",
  pace: 2,
  start: "2026-10-30",
  deadline: "2026-12-31",
  year: 2026,
  restDays: [],
  excluded: [],
  status: "reading",
  tasks: { "2026-10-30": 2 },
  entries: [],
  cover: undefined,
};
describe("JSONB и идентичность данных", () => {
  it("порядок ключей и отсутствующие необязательные поля не создают конфликты", () => {
    const fromServer = Object.fromEntries(
      Object.entries(JSON.parse(JSON.stringify(b))).reverse(),
    );
    expect(equivalent(b, fromServer)).toBe(true);
  });
  it("разный порядок записей чтения не считается одинаковыми массивами", () =>
    expect(equivalent([1, 2], [2, 1])).toBe(false));
  it("локальный перенос не дублирует книгу, прошедшую через JSONB", () => {
    const account = { ...emptyData(), books: [JSON.parse(JSON.stringify(b))] },
      guest = { ...emptyData(), books: [b] };
    expect(mergeGuest(account, guest).books).toHaveLength(1);
  });
  it("конфликтующие версии книги не перезаписываются автоматически", () => {
    expect(() =>
      mergeGuest(
        { ...emptyData(), books: [b] },
        { ...emptyData(), books: [{ ...b, title: "Другое название" }] },
      ),
    ).toThrow();
  });
  it("настройки по умолчанию с другим порядком ключей не выдаются за данные пользователя", () => {
    const data = emptyData();
    data.settings = Object.fromEntries(
      Object.entries(data.settings).reverse(),
    ) as typeof data.settings;
    expect(hasData(data)).toBe(false);
  });
});
