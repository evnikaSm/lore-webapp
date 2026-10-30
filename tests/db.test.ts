import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { parseBackup, load, save } from "../src/db";
import { defaultSettings, type Data } from "../src/types";
const empty: Data = { version: 1, books: [], settings: defaultSettings };
describe("Хранилище и резервные копии", () => {
  it("сохраняет данные в IndexedDB", async () => {
    await save({
      ...empty,
      settings: { ...defaultSettings, goals: { 2026: 30 } },
    });
    expect((await load()).settings.goals[2026]).toBe(30);
  });
  it("проверяет формат JSON", () =>
    expect(() => parseBackup("no json")).toThrow());
  it("читает экспорт без потери настроек", () =>
    expect(parseBackup(JSON.stringify(empty))).toEqual(empty));
  it.each([
    { ...empty, version: 2 },
    { ...empty, books: [{}] },
    { ...empty, settings: { ...defaultSettings, pace: 0 } },
    { ...empty, settings: { ...defaultSettings, restDays: [7] } },
    { ...empty, settings: { ...defaultSettings, goals: { 2026: -1 } } },
  ])("отклоняет повреждённые данные", (d) =>
    expect(() => parseBackup(JSON.stringify(d))).toThrow(),
  );
});

it("IndexedDB хранит аккаунты отдельно от гостевой библиотеки", async () => {
  const { cacheRepository } = await import("../src/db");
  const guest = await cacheRepository.read(null);
  await cacheRepository.transact("account-isolated", (cache) => ({
    ...cache,
    value: { ...empty, settings: { ...defaultSettings, goals: { 2026: 88 } } },
    revision: 3,
    dirty: true,
    generation: 1,
  }));
  expect(
    (await cacheRepository.read("account-isolated")).value.settings.goals[2026],
  ).toBe(88);
  expect((await cacheRepository.read("another-account")).value.books).toEqual(
    [],
  );
  expect((await cacheRepository.read(null)).value).toEqual(guest.value);
});
