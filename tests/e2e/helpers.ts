import type { Page } from "@playwright/test";

/** Opens a menu in the left icon bar (no-op if it is already open). */
export async function openLeftPanel(page: Page, name: "Presets" | "Backgrounds") {
  const button = page.getByRole("navigation", { name: "Menu" }).getByRole("button", { name, exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
}
