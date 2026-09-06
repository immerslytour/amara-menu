import type { Locator, Page } from 'playwright';

export type LocatorSpec =
  | { role: 'button' | 'link' | 'radio' | 'textbox' | 'option' | 'menuitem' | 'heading'; name: RegExp | string }
  | { label: RegExp | string }
  | { placeholder: RegExp | string }
  | { testId: string };

/** Same as firstVisible, but searched inside a specific element. */
export async function firstVisibleIn(
  scope: Locator,
  specs: readonly LocatorSpec[],
  timeoutMs = 4000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const spec of specs) {
      const loc = buildIn(scope, spec).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await new Promise((r) => setTimeout(r, 250));
  } while (Date.now() < deadline);
  return null;
}

/** Returns the first candidate that actually resolves to a visible element. */
export async function firstVisible(
  page: Page,
  specs: readonly LocatorSpec[],
  timeoutMs = 6000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const spec of specs) {
      const loc = build(page, spec).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await page.waitForTimeout(250);
  } while (Date.now() < deadline);
  return null;
}

/** Same, but for raw CSS selector strings. */
export async function firstVisibleCss(
  page: Page,
  selectors: readonly string[],
  timeoutMs = 6000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await page.waitForTimeout(250);
  } while (Date.now() < deadline);
  return null;
}

/** File inputs are usually hidden, so visibility is not the right test. */
export async function firstAttachedCss(
  page: Page,
  selectors: readonly string[],
  timeoutMs = 6000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) return loc;
    }
    await page.waitForTimeout(250);
  } while (Date.now() < deadline);
  return null;
}

function build(page: Page, spec: LocatorSpec): Locator {
  if ('role' in spec) return page.getByRole(spec.role, { name: spec.name });
  if ('label' in spec) return page.getByLabel(spec.label);
  if ('placeholder' in spec) return page.getByPlaceholder(spec.placeholder);
  return page.getByTestId(spec.testId);
}

function buildIn(scope: Locator, spec: LocatorSpec): Locator {
  if ('role' in spec) return scope.getByRole(spec.role, { name: spec.name });
  if ('label' in spec) return scope.getByLabel(spec.label);
  if ('placeholder' in spec) return scope.getByPlaceholder(spec.placeholder);
  return scope.getByTestId(spec.testId);
}
