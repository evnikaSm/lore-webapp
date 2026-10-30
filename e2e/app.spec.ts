import { test, expect, type Page } from "@playwright/test";
async function createBook(
  page: Page,
  title = "Тестовая история",
  unit = "pages",
) {
  await page
    .getByRole("button", { name: "Добавить книгу", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Название книги").fill(title);
  await modal.getByLabel("Автор").fill("Автор истории");
  await modal.getByRole("button", { name: "Продолжить" }).click();
  if (unit === "chapters")
    await modal.getByRole("button", { name: "Главы", exact: true }).click();
  await modal
    .getByLabel(unit === "pages" ? "Всего страниц" : "Всего глав")
    .fill("40");
  await modal.getByRole("button", { name: "Продолжить" }).click();
  await modal
    .getByRole("button", { name: "Читать в своём темпе", exact: false })
    .click();
  await modal.getByLabel("Дневная норма").fill("10");
  await modal.getByRole("button", { name: "Продолжить" }).click();
  await modal.getByRole("button", { name: "Продолжить" }).click();
  await modal.getByRole("button", { name: "Сохранить книгу" }).click();
  await expect(modal).not.toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-30T12:00:00+01:00") });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();
});
test("добавление, фактическое чтение, перезагрузка и завершение", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.screenshot({
    path: "test-results/phone-empty.png",
    fullPage: true,
  });
  await createBook(page);
  await page.screenshot({
    path: "test-results/phone-book.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Отметить прочитанное", exact: true })
    .click();
  await page.getByLabel("Сколько страниц вы прочитали?").fill("15");
  await page.getByRole("button", { name: "Сохранить чтение" }).click();
  await expect(page.getByText("15 из 40 стр.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("15 из 40 стр.")).toBeVisible();
  await page
    .getByRole("button", { name: "Отметить прочитанное", exact: true })
    .click();
  await page.getByLabel("Сколько страниц вы прочитали?").fill("25");
  await page.getByRole("button", { name: "Сохранить чтение" }).click();
  await expect(page.getByRole("status")).toContainText("Книга завершена");
  await page
    .getByRole("button", { name: "Моя цель на год", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 из 20 историй уже с вами" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("долг сохраняется, погашается и не дублирует прогресс", async ({
  page,
}) => {
  await createBook(page);
  await page.clock.setSystemTime(new Date("2026-11-02T12:00:00+01:00"));
  await page.reload();
  await expect(page.getByText("Можно наверстать: 20 стр.")).toBeVisible();
  await page
    .getByRole("button", { name: "Отметить прочитанное", exact: true })
    .click();
  await page.getByLabel("Сколько страниц вы прочитали?").fill("25");
  await page.getByRole("button", { name: "Сохранить чтение" }).click();
  await expect(page.getByText("25 из 40 стр.")).toBeVisible();
  await expect(page.getByText("5 стр. осталось сегодня")).toBeVisible();
  await expect(page.getByText("Можно наверстать: 20 стр.")).not.toBeVisible();
});
test("календарь, запись задним числом и разовый отдых", async ({ page }) => {
  await createBook(page);
  await page.clock.setSystemTime(new Date("2026-11-02T12:00:00+01:00"));
  await page.reload();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Календарь", exact: true })
    .click();
  await page
    .getByRole("button", { name: "1 ноября 2026 г.", exact: true })
    .click();
  await page.getByRole("button", { name: "Записать", exact: true }).click();
  await page.getByLabel("Сколько страниц вы прочитали?").fill("10");
  await page.getByRole("button", { name: "Сохранить чтение" }).click();
  await page
    .getByRole("button", { name: "3 ноября 2026 г.", exact: true })
    .click();
  await page.getByRole("button", { name: "День отдыха", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Убрать выходной" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Неделя", exact: true }).click();
  await expect(page.locator(".calendar-day")).toHaveCount(7);
});
test("экспорт, удаление, подтверждённое восстановление и аналитика", async ({
  page,
}) => {
  await createBook(page, "Книга в главах", "chapters");
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Книги", exact: true })
    .click();
  await page.getByRole("button", { name: "Открыть Книга в главах" }).click();
  await page
    .getByRole("button", { name: "Удалить книгу", exact: true })
    .click();
  await page.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles(path!);
  await page.getByRole("button", { name: "Заменить и восстановить" }).click();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Прогресс", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Прогресс", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Главы", exact: true }).click();
  await expect(page.locator(".recharts-wrapper")).toHaveCount(2);
});
test("мобильная навигация и отсутствие горизонтального переполнения", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.locator(".bottom-nav")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await createBook(page, "Мобильная книга");
  await page.getByRole("button", { name: "Скрыть сообщение" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of [
      "Книги",
      "Календарь",
      "Прогресс",
      "Настройки",
      "Сегодня",
    ]) {
      await page
        .locator(".bottom-nav")
        .getByRole("button", { name, exact: true })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const nav = await page.locator(".bottom-nav").boundingBox();
      expect(nav!.width).toBeLessThanOrEqual(width);
      expect(nav!.y + nav!.height).toBeLessThanOrEqual(845);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    (await page.locator(".app-shell").boundingBox())!.width,
  ).toBeLessThanOrEqual(480);
  await expect(page.locator(".bottom-nav")).toBeVisible();
});
test("production PWA открывается и сохраняет записи без сети", async ({
  page,
  context,
}) => {
  await createBook(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("Тестовая история", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Отметить прочитанное", exact: true })
    .click();
  await page.getByLabel("Сколько страниц вы прочитали?").fill("5");
  await page.getByRole("button", { name: "Сохранить чтение" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(page.getByText("5 из 40 стр.")).toBeVisible();
  await context.setOffline(false);
});

test("единицы выбираются в ритме книги, а не в общих настройках", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Добавить книгу", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Название книги").fill("План по главам");
  await modal.getByRole("button", { name: "Продолжить" }).click();
  await modal.getByLabel("Всего страниц").fill("240");
  await modal.getByRole("button", { name: "Продолжить" }).click();
  await modal.getByRole("button", { name: "Читать в своём темпе" }).click();
  await modal.getByRole("button", { name: "Главы", exact: true }).click();
  await expect(modal.getByLabel("Всего глав")).toHaveValue("");
  await modal.getByRole("button", { name: "Продолжить" }).click();
  await expect(modal.getByRole("alert")).toBeVisible();
  await modal.getByLabel("Всего глав").fill("8");
  await modal.getByLabel("Дневная норма, гл.").fill("2");
  await modal.getByRole("button", { name: "Страницы", exact: true }).click();
  await expect(modal.getByLabel("Дневная норма, стр.")).toBeVisible();
  await modal.getByRole("button", { name: "Главы", exact: true }).click();
  await expect(modal.getByLabel("Всего глав")).toHaveValue("8");
  await modal.getByRole("button", { name: "Продолжить" }).click();
  await modal.getByRole("button", { name: "Продолжить" }).click();
  await expect(modal.getByText("8 гл. осталось · 2 гл. в день")).toBeVisible();
  await modal.getByRole("button", { name: "Сохранить книгу" }).click();
  await expect(page.getByText("0 из 8 гл.")).toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await expect(page.getByLabel("Единица чтения")).toHaveCount(0);
  await expect(page.getByLabel("Норма в день")).toHaveCount(0);
});

test("завершённая книга засчитывается в фактический год окончания", async ({
  page,
}) => {
  await createBook(page, "Через новый год");
  await page.clock.setSystemTime(new Date("2027-01-02T12:00:00+01:00"));
  await page.reload();
  await page
    .getByRole("button", { name: "Отметить прочитанное", exact: true })
    .click();
  await page.getByLabel("Сколько страниц вы прочитали?").fill("40");
  await page.getByRole("button", { name: "Сохранить чтение" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Моя цель на год", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 из 20 историй уже с вами" }),
  ).toBeVisible();
  await page.getByLabel("Год читательской цели").selectOption("2026");
  await expect(
    page.getByRole("heading", { name: "0 из 20 историй уже с вами" }),
  ).toBeVisible();
  await page.getByLabel("Год читательской цели").selectOption("2027");
  await page.reload();
  await page
    .getByRole("button", { name: "Моя цель на год", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 из 20 историй уже с вами" }),
  ).toBeVisible();
});

test("перелистывание запускается после сохранения, повторяется и работает при завершении", async ({
  page,
}) => {
  await createBook(page, "Анимация чтения");
  await page.evaluate(() => {
    document.documentElement.dataset.readingTurns = "0";
    document.addEventListener("animationstart", (event) => {
      if (event.animationName === "reading-page-turn")
        document.documentElement.dataset.readingTurns = String(
          Number(document.documentElement.dataset.readingTurns) + 1,
        );
    });
  });
  await expect(page.locator(".page-turn")).toHaveCount(0);
  for (const amount of [10, 10, 20]) {
    const count = Number(
      await page.locator("html").getAttribute("data-reading-turns"),
    );
    await page
      .getByRole("button", { name: "Отметить прочитанное", exact: true })
      .click();
    await page.getByLabel("Сколько страниц вы прочитали?").fill(String(amount));
    await page.getByRole("button", { name: "Сохранить чтение" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect
      .poll(async () =>
        Number(await page.locator("html").getAttribute("data-reading-turns")),
      )
      .toBeGreaterThan(count);
    await expect(page.locator(".reading-toast-progress")).toBeVisible();
    await expect(page.locator(".page-turn")).toHaveCount(0);
  }
  await expect(page.getByRole("status")).toContainText("Книга завершена");
});

test("перелистывание учитывает системное уменьшение движения", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createBook(page, "Спокойное чтение");
  await page.evaluate(() => {
    document.documentElement.dataset.readingTurns = "0";
    document.addEventListener("animationstart", (event) => {
      if (event.animationName === "reading-page-turn")
        document.documentElement.dataset.readingTurns = "1";
    });
  });
  await page
    .getByRole("button", { name: "Отметить прочитанное", exact: true })
    .click();
  await page.getByLabel("Сколько страниц вы прочитали?").fill("5");
  await page.getByRole("button", { name: "Сохранить чтение" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("5 из 40 стр.")).toBeVisible();
  await expect(page.locator(".page-turn")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-reading-turns", "0");
});
