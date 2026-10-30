import { test, expect, type Page, type BrowserContext } from "@playwright/test";
const owner = "11111111-1111-4111-8111-111111111111";
const payload = (n: number) => ({
  version: 1,
  books: [],
  settings: {
    goals: { 2026: n },
    restDays: [0],
    unit: "pages",
    mode: "deadline",
    pace: 10,
  },
});
function session() {
  const user = {
    id: owner,
    aud: "authenticated",
    role: "authenticated",
    email: "reader@example.com",
    user_metadata: { full_name: "Тестовый читатель" },
    app_metadata: { provider: "google", providers: ["google"] },
    created_at: "2026-01-01T00:00:00Z",
  };
  const token =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: owner,
        aud: "authenticated",
        role: "authenticated",
        exp: 2147483000,
        iat: 1700000000,
      }),
    ).toString("base64url") +
    ".test";
  return {
    access_token: token,
    refresh_token: "fake-refresh-token-for-tests",
    expires_at: 2147483000,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
}
async function mockCloud(
  context: BrowserContext,
  initial: ReturnType<typeof payload> | null = payload(30),
) {
  let row = initial ? { payload: initial, revision: 1 } : null;
  await context.route(
    "https://book-year-test.supabase.co/**",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/auth/v1/user") {
        await route.fulfill({ json: session().user });
        return;
      }
      if (url.pathname === "/auth/v1/logout") {
        await route.fulfill({ status: 204 });
        return;
      }
      if (url.pathname === "/rest/v1/reading_libraries") {
        await route.fulfill({ json: row ? [row] : [] });
        return;
      }
      if (url.pathname === "/rest/v1/rpc/save_reading_library") {
        const body = route.request().postDataJSON();
        if (body.p_user_id !== owner) {
          await route.fulfill({ status: 401, json: { code: "28000" } });
          return;
        }
        if (body.p_expected_revision !== (row?.revision ?? 0)) {
          await route.fulfill({
            status: 409,
            json: { code: "40001", message: "Library conflict" },
          });
          return;
        }
        row = { payload: body.p_payload, revision: (row?.revision ?? 0) + 1 };
        await route.fulfill({ json: row.revision });
        return;
      }
      await route.fulfill({
        status: 400,
        json: { message: "Unhandled test endpoint" },
      });
    },
  );
  return {
    get row() {
      return row;
    },
    set: (n: number) => {
      row = { payload: payload(n), revision: (row?.revision ?? 0) + 1 };
    },
  };
}
async function signedIn(page: Page) {
  await page.addInitScript((session) => {
    if (!sessionStorage.getItem("auth-test-seeded")) {
      localStorage.setItem(
        "sb-book-year-test-auth-token",
        JSON.stringify(session),
      );
      sessionStorage.setItem("auth-test-seeded", "1");
    }
  }, session());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Сегодня", exact: true }),
  ).toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
}
test("загрузка аккаунта, изменение цели, облачная запись и выход без утечки в гостевой режим", async ({
  page,
  context,
}) => {
  const cloud = await mockCloud(context);
  await signedIn(page);
  await expect(page.getByText("reader@example.com")).toBeVisible();
  await expect(page.getByText("Всё сохранено в аккаунте")).toBeVisible();
  await expect(page.getByLabel(/Годовая цель на/)).toHaveValue("30");
  await page.getByLabel(/Годовая цель на/).fill("42");
  await page
    .getByRole("button", { name: "Сохранить настройки", exact: true })
    .click();
  await expect.poll(() => cloud.row?.payload.settings.goals[2026]).toBe(42);
  await expect(page.getByText("Всё сохранено в аккаунте")).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Войти через Google" }),
  ).toBeEnabled();
  await expect(page.getByText("reader@example.com")).toHaveCount(0);
  await expect(page.getByLabel(/Годовая цель на/)).toHaveValue("20");
});
test("подтверждённый выбор при конфликте с другим устройством", async ({
  page,
  context,
}) => {
  const cloud = await mockCloud(context);
  await signedIn(page);
  await expect(page.getByText("Всё сохранено в аккаунте")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel(/Годовая цель на/).fill("12");
  await page
    .getByRole("button", { name: "Сохранить настройки", exact: true })
    .click();
  await expect(
    page.getByText("Нет сети. Изменения сохранены на устройстве"),
  ).toBeVisible();
  cloud.set(55);
  await context.unroute("https://book-year-test.supabase.co/**");
  await context.route(
    "https://book-year-test.supabase.co/**",
    async (route) => {
      if (route.request().url().includes("/reading_libraries"))
        await route.fulfill({ json: [cloud.row] });
      else
        await route.fulfill({ status: 400, json: { message: "unexpected" } });
    },
  );
  await context.setOffline(false);
  await expect(page.getByText("Какую библиотеку оставить?")).toBeVisible();
  await expect(page.getByLabel(/Годовая цель на/)).toHaveValue("12");
  await page.getByRole("button", { name: "Оставить из аккаунта" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByLabel(/Годовая цель на/)).toHaveValue("55");
});
test("Google-вход использует OAuth и PKCE с возвратом в приложение", async ({
  page,
  context,
}) => {
  await mockCloud(context, null);
  await context.route(
    "https://book-year-test.supabase.co/auth/v1/authorize**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "OAuth provider test",
      }),
  );
  await page.goto("/");
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  const request = page.waitForRequest((r) =>
    r.url().includes("/auth/v1/authorize"),
  );
  await page.getByRole("button", { name: "Войти через Google" }).click();
  const url = new URL((await request).url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(url.searchParams.get("redirect_to")).toBe("http://127.0.0.1:4175/");
});
