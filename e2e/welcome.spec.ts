import { test, expect } from "@playwright/test";

test("first visit, immediate language change, dismissal and persistent settings", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Добро пожаловать в Lore" }),
  ).toBeVisible();
  await expect(dialog.getByText(/Они могут потеряться/)).toBeVisible();
  await page.screenshot({ path: "test-results/welcome-russian.png" });
  await dialog.getByRole("combobox").selectOption("en");
  await expect(
    dialog.getByRole("heading", { name: "Welcome to Lore" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/welcome-english.png" });
  await dialog
    .getByRole("button", { name: "Continue without an account" })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Settings" })
    .click();
  await page.getByLabel("App language").selectOption("pl");
  await expect(
    page.getByRole("heading", { name: "Ustawienia", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Zaloguj się przez Google" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(
    page.getByRole("heading", { name: "Dzisiaj", exact: true }),
  ).toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Ustawienia" })
    .click();
  await expect(page.getByLabel("Język aplikacji")).toHaveValue("pl");
  await page.getByLabel("Język aplikacji").selectOption("ru");
  await expect(
    page.getByRole("heading", { name: "Настройки", exact: true }),
  ).toBeVisible();
});

test("translated book wizard, original book data and localized calendar and charts", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-31T12:00:00+01:00") });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").selectOption("en");
  await dialog
    .getByRole("button", { name: "Continue without an account" })
    .click();
  await page.getByRole("button", { name: "Add a book", exact: true }).click();
  await dialog.getByLabel("Book title").fill("Моя история");
  await dialog.getByLabel(/Author/).fill("Mój autor");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByLabel("Total pages").fill("40");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: /Read at your own pace/ }).click();
  await dialog.getByLabel(/Daily target/).fill("10");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: "Save book", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Log reading", exact: true }).click();
  await dialog.getByLabel("How many pages did you read?").fill("5");
  await dialog
    .getByRole("button", { name: "Save reading", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Settings" })
    .click();
  await page.getByLabel("App language").selectOption("pl");
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Książki", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Моя история", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Mój autor", { exact: true }).last(),
  ).toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Kalendarz" })
    .click();
  await expect(
    page.getByRole("heading", { name: "październik 2026" }),
  ).toBeVisible();
  await expect(page.locator(".calendar-weekhead")).toContainText("pon.");
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Postępy" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Plan i wykonanie" }),
  ).toBeVisible();
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(page.locator(".recharts-legend-wrapper")).toContainText(
    "Wykonanie",
  );
  await page.screenshot({
    path: "test-results/polish-progress.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("closing the first-visit dialog remembers the choice", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Сегодня", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
