import { translate } from "./i18n";
import type { Data } from "./types";
import { defaultSettings } from "./types";
export interface Cache {
  id: string;
  value: Data;
  revision: number;
  dirty: boolean;
  generation: number;
  guestImported?: boolean;
}
export interface CacheRepository {
  read(owner: string | null): Promise<Cache>;
  transact(
    owner: string | null,
    update: (current: Cache) => Cache,
  ): Promise<Cache>;
}
export interface CloudSnapshot {
  value: Data;
  revision: number;
}
export interface CloudRepository {
  read(owner: string): Promise<CloudSnapshot | null>;
  push(owner: string, value: Data, revision: number): Promise<number>;
}
export type SyncPhase =
  | "loading"
  | "guest"
  | "synced"
  | "pending"
  | "syncing"
  | "offline"
  | "error"
  | "conflict";
export interface LibraryView {
  data?: Data;
  owner: string | null;
  phase: SyncPhase;
  error?: string;
  dirty: boolean;
  conflict?: CloudSnapshot;
  guestAvailable: boolean;
}
export const emptyData = (): Data => ({
  version: 1,
  books: [],
  settings: structuredClone(defaultSettings),
});
export const emptyCache = (owner: string | null): Cache => ({
  id: owner ?? "guest",
  value: emptyData(),
  revision: 0,
  dirty: false,
  generation: 0,
});
export function equivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equivalent(v, b[i]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined),
    other = Object.keys(right).filter((k) => right[k] !== undefined);
  return (
    keys.length === other.length &&
    keys.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(right, k) &&
        equivalent(left[k], right[k]),
    )
  );
}
export function hasData(data: Data) {
  return data.books.length > 0 || !equivalent(data.settings, defaultSettings);
}
export function mergeGuest(account: Data, guest: Data): Data {
  const books = new Map(account.books.map((b) => [b.id, b]));
  for (const b of guest.books) {
    const existing = books.get(b.id);
    if (existing && !equivalent(existing, b))
      throw new Error(
        translate(
          "У этой книги уже есть другая версия в аккаунте. Сохраните резервную копию и перенесите нужные данные через импорт JSON.",
        ),
      );
    books.set(b.id, b);
  }
  return {
    version: 1,
    books: [...books.values()],
    settings: hasData(account)
      ? {
          ...account.settings,
          goals: { ...guest.settings.goals, ...account.settings.goals },
        }
      : guest.settings,
  };
}
export class LibraryController {
  private cache: Cache | null = null;
  private owner: string | null = null;
  private epoch = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private running: Promise<void> | null = null;
  private rerun = false;
  private conflict: CloudSnapshot | undefined;
  private listeners = new Set<(view: LibraryView) => void>();
  private view: LibraryView = {
    owner: null,
    phase: "loading",
    dirty: false,
    guestAvailable: false,
  };
  constructor(
    private local: CacheRepository,
    private cloud: CloudRepository | null,
    private online = () => navigator.onLine,
  ) {}
  subscribe(fn: (v: LibraryView) => void) {
    this.listeners.add(fn);
    fn(this.view);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private setCache(next: Cache) {
    this.cache =
      this.cache?.id === next.id && this.cache.generation === next.generation
        ? { ...next, value: this.cache.value }
        : next;
  }
  private emit(phase: SyncPhase, error?: string) {
    this.view = {
      data: this.cache?.value,
      owner: this.owner,
      phase,
      error,
      dirty: this.cache?.dirty ?? false,
      conflict: this.conflict,
      guestAvailable: this.view.guestAvailable,
    };
    for (const fn of this.listeners) fn(this.view);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => {});
    return next;
  }
  async open(owner: string | null) {
    const epoch = ++this.epoch;
    this.owner = owner;
    this.cache = null;
    this.conflict = undefined;
    this.view.guestAvailable = false;
    this.emit("loading");
    await this.serial(async () => {
      const cache = await this.local.read(owner);
      const guest = owner ? await this.local.read(null) : null;
      if (epoch !== this.epoch) return;
      this.setCache(cache);
      this.view.guestAvailable =
        !!guest && hasData(guest.value) && !cache.guestImported;
      this.emit(owner ? (this.online() ? "pending" : "offline") : "guest");
    });
    if (epoch === this.epoch) void this.sync();
  }
  async mutate(update: (data: Data) => Data, importGuest = false) {
    const epoch = this.epoch,
      owner = this.owner;
    if (!this.cache)
      throw new Error(translate("Дождитесь загрузки библиотеки."));
    await this.serial(async () => {
      if (epoch !== this.epoch)
        throw new Error(
          translate("Учётная запись изменилась. Повторите действие."),
        );
      const cache = await this.local.transact(owner, (c) => ({
        ...c,
        value: update(c.value),
        generation: c.generation + 1,
        dirty: owner !== null,
        guestImported: importGuest || c.guestImported,
      }));
      if (epoch !== this.epoch) return;
      this.setCache(cache);
      if (importGuest) this.view.guestAvailable = false;
      this.emit(
        this.conflict
          ? "conflict"
          : owner
            ? this.online()
              ? "pending"
              : "offline"
            : "guest",
      );
    });
    void this.sync();
  }
  async importGuest() {
    const guest = await this.local.read(null);
    await this.mutate((data) => mergeGuest(data, guest.value), true);
  }
  sync(): Promise<void> {
    if (!this.owner || !this.cloud || !this.cache) return Promise.resolve();
    if (this.running) {
      this.rerun = true;
      return this.running.then(() => this.running ?? Promise.resolve());
    }
    this.running = this.performSync().finally(() => {
      this.running = null;
      if (this.rerun) {
        this.rerun = false;
        void this.sync();
      }
    });
    return this.running;
  }
  private async performSync() {
    const epoch = this.epoch,
      owner = this.owner!;
    const cloud = this.cloud!;
    if (this.conflict) return;
    if (!this.online()) {
      this.emit("offline");
      return;
    }
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        if (epoch !== this.epoch) return;
        const sent = await this.serial(() => this.local.read(owner));
        if (epoch !== this.epoch) return;
        this.setCache(sent);
        this.emit("syncing");
        const remote = await cloud.read(owner);
        if (epoch !== this.epoch) return;
        const revision = remote?.revision ?? 0;
        if (!sent.dirty) {
          if (!remote && sent.revision > 0) {
            this.conflict = { value: emptyData(), revision: 0 };
            this.emit("conflict");
            return;
          }
          const next = await this.serial(() =>
            this.local.transact(owner, (current) =>
              current.generation !== sent.generation ||
              current.dirty ||
              current.revision === revision
                ? current
                : {
                    ...current,
                    value: remote?.value ?? current.value,
                    revision,
                    generation: current.generation + 1,
                  },
            ),
          );
          if (epoch !== this.epoch) return;
          this.setCache(next);
          if (next.dirty) continue;
          this.emit("synced");
          return;
        }
        if (
          sent.revision !== revision &&
          remote &&
          equivalent(remote.value, sent.value)
        ) {
          const next = await this.serial(() =>
            this.local.transact(owner, (current) => ({
              ...current,
              revision,
              dirty: current.generation !== sent.generation,
            })),
          );
          if (epoch !== this.epoch) return;
          this.setCache(next);
          if (next.dirty) continue;
          this.emit("synced");
          return;
        }
        if (sent.revision !== revision) {
          this.conflict = remote ?? { value: emptyData(), revision: 0 };
          this.emit("conflict");
          return;
        }
        let savedRevision: number;
        try {
          savedRevision = await cloud.push(owner, sent.value, sent.revision);
        } catch (e) {
          if ((e as { code?: string }).code === "40001") continue;
          throw e;
        }
        // A completed write always acknowledges the same account cache, even after sign-out.
        const next = await this.serial(() =>
          this.local.transact(owner, (current) => ({
            ...current,
            revision: Math.max(current.revision, savedRevision),
            dirty: current.generation !== sent.generation,
          })),
        );
        if (epoch !== this.epoch) return;
        this.setCache(next);
        if (next.dirty) continue;
        this.emit("synced");
        return;
      }
      this.emit("pending");
    } catch (e) {
      if (epoch === this.epoch)
        this.emit(this.online() ? "error" : "offline", syncError(e));
    }
  }
  async resolve(choice: "local" | "cloud") {
    if (!this.conflict || !this.cache || !this.owner) return;
    const epoch = this.epoch,
      owner = this.owner,
      remote = this.conflict;
    await this.serial(async () => {
      const next = await this.local.transact(owner, (c) => ({
        ...c,
        value: choice === "cloud" ? remote.value : c.value,
        revision: remote.revision,
        dirty: choice === "local",
        generation: c.generation + 1,
      }));
      if (epoch !== this.epoch) return;
      this.setCache(next);
      this.conflict = undefined;
      this.emit("pending");
    });
    await this.sync();
  }
}
export function syncError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "PGRST202" || code === "42P01")
    return translate(
      "Хранилище аккаунта ещё не подключено. Обратитесь к владельцу приложения.",
    );
  if (code === "401" || code === "PGRST301" || code === "28000")
    return translate(
      "Войдите в аккаунт повторно, чтобы продолжить синхронизацию.",
    );
  if (code === "22023" || code === "23514")
    return translate(
      "Не удалось загрузить библиотеку: проверьте её объём и формат.",
    );
  return translate(
    "Не удалось связаться с аккаунтом. Изменения сохранены на устройстве; синхронизацию можно повторить.",
  );
}
