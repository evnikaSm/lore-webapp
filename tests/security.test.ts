import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { emptyData } from "../src/sync";
let db: PGlite;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
async function user(id: string, role = "authenticated") {
  await db.exec(
    `reset role;set request.jwt.claim.sub='${id}';set role ${role};`,
  );
}
const push = (
  owner: string,
  revision: number,
  payload: unknown = emptyData(),
) =>
  db.query<{ revision: number }>(
    "select public.save_reading_library($1::jsonb,$2::bigint,$3::uuid) as revision",
    [JSON.stringify(payload), revision, owner],
  );
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`,
  );
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/202610300001_reading_accounts.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("reset role;truncate public.reading_libraries;");
});
describe("PostgreSQL: изоляция и атомарные версии", () => {
  it("сохраняет от имени пользователя с версией 1", async () => {
    await user(a);
    const r = await push(a, 0);
    expect(r.rows[0].revision).toBe(1);
  });
  it("RLS скрывает библиотеку другого пользователя", async () => {
    await user(a);
    await push(a, 0);
    await user(b);
    expect(
      (await db.query("select * from public.reading_libraries")).rows,
    ).toEqual([]);
    await push(b, 0);
    expect(
      (
        await db.query<{ user_id: string }>(
          "select user_id from public.reading_libraries",
        )
      ).rows.map((x) => x.user_id),
    ).toEqual([b]);
  });
  it("аноним не читает библиотеки и не вызывает сохранение", async () => {
    await user("", "anon");
    await expect(
      db.query("select * from public.reading_libraries"),
    ).rejects.toThrow(/permission denied/);
    await expect(push(a, 0)).rejects.toThrow(/permission denied/);
  });
  it("нельзя записать библиотеку в чужой аккаунт", async () => {
    await user(a);
    await expect(push(b, 0)).rejects.toThrow(/Authentication required/);
  });
  it("нельзя обойти проверку версии прямой записью", async () => {
    await user(a);
    await push(a, 0);
    await expect(
      db.query("update public.reading_libraries set revision=100"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("delete from public.reading_libraries"),
    ).rejects.toThrow(/permission denied/);
  });
  it("устаревшая версия не затирает новые данные", async () => {
    await user(a);
    await push(a, 0);
    const updated = {
      ...emptyData(),
      settings: { ...emptyData().settings, goals: { 2026: 30 } },
    };
    await push(a, 1, updated);
    await expect(push(a, 1)).rejects.toMatchObject({ code: "40001" });
    expect(
      (
        await db.query<{ payload: unknown; revision: number }>(
          "select payload,revision from public.reading_libraries",
        )
      ).rows[0],
    ).toEqual({ payload: updated, revision: 2 });
  });
  it("два устройства не создают вторую строку при первом сохранении", async () => {
    await user(a);
    await push(a, 0);
    await expect(push(a, 0)).rejects.toMatchObject({ code: "40001" });
  });
  it("проверяет формат и обязательные поля", async () => {
    await user(a);
    await expect(push(a, 0, { version: 1 })).rejects.toMatchObject({
      code: "22023",
    });
    await expect(push(a, -1)).rejects.toMatchObject({ code: "22023" });
  });
  it("отклоняет запрос без авторизованного пользователя даже с ролью authenticated", async () => {
    await user("");
    await expect(push(a, 0)).rejects.toMatchObject({ code: "28000" });
  });
});
