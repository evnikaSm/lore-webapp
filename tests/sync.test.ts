import { describe, it, expect } from "vitest";
import {
  LibraryController,
  emptyCache,
  emptyData,
  mergeGuest,
  type Cache,
  type CacheRepository,
  type CloudRepository,
  type CloudSnapshot,
  type LibraryView,
} from "../src/sync";
class Local implements CacheRepository {
  rows = new Map<string, Cache>();
  async read(owner: string | null) {
    return structuredClone(
      this.rows.get(owner ?? "guest") ?? emptyCache(owner),
    );
  }
  async transact(owner: string | null, fn: (c: Cache) => Cache) {
    const id = owner ?? "guest";
    const next = fn(structuredClone(this.rows.get(id) ?? emptyCache(owner)));
    this.rows.set(id, structuredClone(next));
    return structuredClone(next);
  }
}
class Cloud implements CloudRepository {
  rows = new Map<string, CloudSnapshot>();
  failed = false;
  afterPush: (() => Promise<void>) | null = null;
  async read(owner: string) {
    if (this.failed) throw Error("offline");
    return structuredClone(this.rows.get(owner) ?? null);
  }
  async push(owner: string, value: Cache["value"], revision: number) {
    if (this.failed) throw Error("offline");
    const current = this.rows.get(owner);
    if ((current?.revision ?? 0) !== revision)
      throw Object.assign(Error("conflict"), { code: "40001" });
    const next = revision + 1;
    this.rows.set(owner, { value: structuredClone(value), revision: next });
    if (this.afterPush) {
      const fn = this.afterPush;
      this.afterPush = null;
      await fn();
    }
    return next;
  }
}
function fixture(cloud = new Cloud(), local = new Local()) {
  let online = true;
  let view: LibraryView;
  const controller = new LibraryController(local, cloud, () => online);
  controller.subscribe((v) => {
    view = v;
  });
  return {
    cloud,
    local,
    controller,
    get view() {
      return view!;
    },
    offline: () => {
      online = false;
    },
    online: () => {
      online = true;
    },
  };
}
const goal = (n: number): import("../src/types").Data => ({
  ...emptyData(),
  settings: { ...emptyData().settings, goals: { 2026: n } },
});
async function settle(f: ReturnType<typeof fixture>) {
  await f.controller.sync();
  await f.controller.sync();
}
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
};
describe("Аккаунты и синхронизация", () => {
  it("гостевая библиотека не отправляется без входа", async () => {
    const f = fixture();
    await f.controller.open(null);
    await f.controller.mutate(() => goal(12));
    await settle(f);
    expect(f.cloud.rows.size).toBe(0);
    expect(f.view.data?.settings.goals[2026]).toBe(12);
  });
  it("сохраняет данные аккаунта и загружает их на другом устройстве", async () => {
    const first = fixture();
    await first.controller.open("a");
    await settle(first);
    await first.controller.mutate(() => goal(30));
    await settle(first);
    const second = fixture(first.cloud);
    await second.controller.open("a");
    await settle(second);
    expect(second.view.data).toEqual(goal(30));
    expect(second.view.phase).toBe("synced");
  });
  it("выход и другой аккаунт не получают приватную библиотеку", async () => {
    const f = fixture();
    await f.controller.open("a");
    await settle(f);
    await f.controller.mutate(() => goal(10));
    await settle(f);
    await f.controller.open(null);
    expect(f.view.data).toEqual(emptyData());
    await f.controller.open("b");
    await settle(f);
    expect(f.view.data).toEqual(emptyData());
    expect(f.cloud.rows.get("a")?.value).toEqual(goal(10));
  });
  it("сохраняет изменения без сети, после перезапуска отправляет их в тот же аккаунт", async () => {
    const f = fixture();
    await f.controller.open("a");
    await settle(f);
    f.offline();
    await f.controller.mutate(() => goal(25));
    expect(f.view.phase).toBe("offline");
    expect((await f.local.read("a")).dirty).toBe(true);
    const restored = fixture(f.cloud, f.local);
    await restored.controller.open("a");
    await settle(restored);
    expect(restored.cloud.rows.get("a")?.value).toEqual(goal(25));
    expect(restored.view.dirty).toBe(false);
  });
  it("не теряет изменения при недоступном сервере", async () => {
    const f = fixture();
    await f.controller.open("a");
    await settle(f);
    f.cloud.failed = true;
    await f.controller.mutate(() => goal(99));
    await settle(f);
    expect(f.view.phase).toBe("error");
    expect(f.view.data).toEqual(goal(99));
    f.cloud.failed = false;
    await settle(f);
    expect(f.cloud.rows.get("a")?.value).toEqual(goal(99));
  });
  it("одновременное изменение на двух устройствах требует выбора, а не затирает данные", async () => {
    const first = fixture(),
      second = fixture(first.cloud);
    await first.controller.open("a");
    await second.controller.open("a");
    await settle(first);
    await settle(second);
    first.offline();
    second.offline();
    await first.controller.mutate(() => goal(10));
    await second.controller.mutate(() => goal(20));
    first.online();
    await settle(first);
    second.online();
    await settle(second);
    expect(second.view.phase).toBe("conflict");
    expect(second.view.data).toEqual(goal(20));
    expect(second.view.conflict?.value).toEqual(goal(10));
    expect(first.cloud.rows.get("a")?.value).toEqual(goal(10));
    await second.controller.resolve("local");
    await settle(second);
    expect(first.cloud.rows.get("a")?.value).toEqual(goal(20));
  });
  it("пользователь может выбрать облачную версию", async () => {
    const f = fixture();
    f.offline();
    await f.controller.open("a");
    await f.controller.mutate(() => goal(3));
    f.cloud.rows.set("a", { value: goal(7), revision: 2 });
    f.online();
    await settle(f);
    await f.controller.resolve("cloud");
    await settle(f);
    expect(f.view.data).toEqual(goal(7));
    expect(f.view.dirty).toBe(false);
  });
  it("редактирование во время отправки не очищает очередь новых изменений", async () => {
    const f = fixture();
    await f.controller.open("a");
    await settle(f);
    const blocked = gate(),
      started = gate();
    f.cloud.afterPush = async () => {
      started.release();
      await blocked.promise;
    };
    await f.controller.mutate(() => goal(1));
    await started.promise;
    await f.controller.mutate(() => goal(2));
    blocked.release();
    await settle(f);
    expect(f.cloud.rows.get("a")?.value).toEqual(goal(2));
    expect(f.view.dirty).toBe(false);
  });
  it("завершённый запрос старого аккаунта не меняет экран и кеш нового аккаунта", async () => {
    const f = fixture();
    await f.controller.open("a");
    await settle(f);
    const blocked = gate(),
      started = gate();
    f.cloud.afterPush = async () => {
      started.release();
      await blocked.promise;
    };
    await f.controller.mutate(() => goal(10));
    await started.promise;
    await f.controller.open("b");
    blocked.release();
    await settle(f);
    expect(f.view.owner).toBe("b");
    expect(f.view.data).toEqual(emptyData());
    expect(f.cloud.rows.has("b")).toBe(false);
    expect((await f.local.read("a")).value).toEqual(goal(10));
  });
  it("перенос гостевых данных выполняется явно и сохраняет гостевую копию", async () => {
    const f = fixture();
    await f.controller.open(null);
    await f.controller.mutate(() => goal(44));
    await f.controller.open("a");
    await settle(f);
    expect(f.view.data).toEqual(emptyData());
    expect(f.view.guestAvailable).toBe(true);
    await f.controller.importGuest();
    await settle(f);
    expect(f.cloud.rows.get("a")?.value).toEqual(goal(44));
    expect((await f.local.read(null)).value).toEqual(goal(44));
    expect(f.view.guestAvailable).toBe(false);
  });
  it("объединение сохраняет цели аккаунта и добавляет отсутствующие годы", () => {
    const account = goal(10),
      guest = goal(20);
    guest.settings.goals[2025] = 12;
    expect(mergeGuest(account, guest).settings.goals).toEqual({
      2026: 10,
      2025: 12,
    });
  });
  it("удаление и импорт передаются как полная согласованная библиотека", async () => {
    const f = fixture();
    await f.controller.open("a");
    await settle(f);
    await f.controller.mutate(() => goal(10));
    await settle(f);
    await f.controller.mutate(() => emptyData());
    await settle(f);
    expect(f.cloud.rows.get("a")?.value).toEqual(emptyData());
  });
});

it("проверка после потери ответа признаёт уже сохранённую копию без конфликта", async () => {
  const f = fixture();
  await f.controller.open("a");
  await settle(f);
  f.cloud.afterPush = async () => {
    throw Error("lost response after commit");
  };
  await f.controller.mutate(() => goal(77));
  await settle(f);
  expect(f.view.phase).toBe("synced");
  expect(f.view.dirty).toBe(false);
  expect(f.cloud.rows.get("a")?.revision).toBe(1);
});
it("опрос той же версии не меняет ссылку на данные и не сбрасывает редактируемые формы", async () => {
  const f = fixture();
  f.cloud.rows.set("a", { value: goal(14), revision: 1 });
  await f.controller.open("a");
  await settle(f);
  const before = f.view.data;
  await settle(f);
  expect(f.view.data).toBe(before);
});
