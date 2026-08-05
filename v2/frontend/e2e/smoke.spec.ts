import { expect, test } from "@playwright/test";

test("safe demo exposes chat, constructor and archive", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Демо-пользователь")).toBeVisible();

  await page.getByRole("button", { name: /Исследователь/ }).click();
  await expect(page.getByPlaceholder("Введите ваш юридический запрос...")).toBeVisible();

  await page.getByRole("button", { name: /Конструктор/ }).click();
  await expect(page.getByRole("heading", { name: "Конструктор документов" })).toBeVisible();
  await expect(page.locator('input[value="ООО «Север»"]')).toBeVisible();

  await page.getByRole("button", { name: /Внутренний поиск/ }).click();
  await expect(page.getByRole("heading", { name: "Архив документов" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Договор_поставки_DEMO-18.pdf" })).toBeVisible();
});
