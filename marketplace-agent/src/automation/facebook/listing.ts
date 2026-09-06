import type { Page } from 'playwright';
import { LISTING_FORM, LISTING_PAGE, URLS } from './selectors';
import { firstAttachedCss, firstVisible } from './locators';
import { captureFailure } from '../diagnostics';
import { goto, openCreateItem } from './navigation';
import type { ListingInput, ListingVerification, PublishResult } from '../MarketplaceAdapter';

/**
 * Creating and verifying a Marketplace listing through the normal website UI.
 * Every step is DOM-driven; if a field cannot be found the flow stops with a
 * screenshot + HTML snapshot instead of clicking around.
 */

async function need(page: Page, specs: any, step: string, what: string) {
  const loc = await firstVisible(page, specs, 8000);
  if (!loc) {
    throw await captureFailure(
      page,
      'SELECTOR_NOT_FOUND',
      step,
      `Could not find "${what}" on the Facebook page. The Marketplace UI may have changed - update src/automation/facebook/selectors.ts.`,
    );
  }
  return loc;
}

export async function publishListing(page: Page, input: ListingInput): Promise<PublishResult> {
  let step = 'open-create-item';
  await openCreateItem(page);

  step = 'select-item-for-sale';
  // Facebook usually lands directly on the item form; the chooser only appears
  // when it routes through /marketplace/create.
  const chooser = await firstVisible(page, LISTING_FORM.itemForSaleOption, 2500);
  if (chooser) {
    await chooser.click();
    await page.waitForTimeout(1500);
  }

  step = 'upload-photos';
  if (input.photoPaths.length) {
    const fileInput = await firstAttachedCss(page, LISTING_FORM.photoInput, 8000);
    if (!fileInput) {
      throw await captureFailure(page, 'SELECTOR_NOT_FOUND', step, 'Could not find the photo upload input.');
    }
    await fileInput.setInputFiles(input.photoPaths);
    await page.waitForTimeout(2500);
  }

  step = 'fill-title';
  await (await need(page, LISTING_FORM.title, step, 'Title field')).fill(input.title);

  step = 'fill-price';
  await (await need(page, LISTING_FORM.price, step, 'Price field')).fill(String(input.price));

  step = 'fill-category';
  const category = await firstVisible(page, LISTING_FORM.category, 3000);
  if (category) {
    await category.click();
    const option = page.getByRole(LISTING_FORM.optionRole, { name: new RegExp(input.category, 'i') }).first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
    } else {
      // A category is mandatory on Facebook; stop rather than pick a random one.
      throw await captureFailure(
        page,
        'UNEXPECTED_UI',
        step,
        `Category "${input.category}" was not offered by Facebook. Pick a category Facebook supports and retry.`,
      );
    }
    await page.waitForTimeout(800);
  }

  step = 'fill-description';
  const description = await firstVisible(page, LISTING_FORM.description, 4000);
  if (description) await description.fill(input.description);

  step = 'fill-location';
  const location = await firstVisible(page, LISTING_FORM.location, 4000);
  if (location) {
    await location.click();
    await location.fill(input.location);
    await page.waitForTimeout(1500);
    const suggestion = page.getByRole(LISTING_FORM.optionRole).first();
    if (await suggestion.isVisible().catch(() => false)) {
      await suggestion.click();
      await page.waitForTimeout(800);
    }
  }

  step = 'click-next';
  const next = await firstVisible(page, LISTING_FORM.nextButton, 4000);
  if (next) {
    await next.click();
    await page.waitForTimeout(2000);
  }

  step = 'click-publish';
  const publish = await need(page, LISTING_FORM.publishButton, step, 'Publish button');
  await publish.click();

  step = 'verify-published';
  const verified = await waitForPublished(page, input.title);
  if (!verified.found) {
    throw await captureFailure(
      page,
      'PUBLISH_NOT_VERIFIED',
      step,
      'Clicked Publish but the listing could not be found afterwards. It may not have been published.',
    );
  }

  return {
    ok: true,
    externalId: verified.url ? (verified.url.match(LISTING_PAGE.itemUrlPattern)?.[1] ?? null) : null,
    externalUrl: verified.url ?? null,
    publishedAt: new Date().toISOString(),
    verified,
  };
}

/**
 * After clicking Publish, confirm in the browser that the listing really exists
 * by finding it in "Your listings". Never assume success.
 */
async function waitForPublished(page: Page, title: string): Promise<ListingVerification> {
  await page.waitForTimeout(4000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const found = await findInYourListings(page, title);
    if (found.found) return found;
    await page.waitForTimeout(3000);
  }
  return { found: false, checkedAt: new Date().toISOString() };
}

export async function findInYourListings(page: Page, title: string): Promise<ListingVerification> {
  await goto(page, URLS.yourListings, 'verify-your-listings');
  const link = page
    .locator('a[href*="/marketplace/item/"]')
    .filter({ hasText: title.slice(0, 40) })
    .first();
  if (!(await link.isVisible().catch(() => false))) {
    return { found: false, checkedAt: new Date().toISOString() };
  }
  const href = await link.getAttribute('href');
  const url = href ? new URL(href, URLS.home).toString().split('?')[0] : undefined;
  const rowText = (await link.innerText().catch(() => '')) || '';
  const priceMatch = rowText.match(LISTING_PAGE.priceProbe);
  return {
    found: true,
    title,
    price: priceMatch ? Number(priceMatch[0].replace(/[^0-9.]/g, '')) : undefined,
    url,
    checkedAt: new Date().toISOString(),
  };
}

export async function verifyListing(
  page: Page,
  ref: { externalId?: string | null; externalUrl?: string | null; title: string },
): Promise<ListingVerification> {
  const url = ref.externalUrl || (ref.externalId ? `https://www.facebook.com/marketplace/item/${ref.externalId}` : null);
  if (url) {
    await goto(page, url, 'verify-listing');
    const heading = page.locator('h1').filter({ hasText: ref.title.slice(0, 30) }).first();
    if (await heading.isVisible().catch(() => false)) {
      const body = await page.locator('body').innerText().catch(() => '');
      const priceMatch = body.match(LISTING_PAGE.priceProbe);
      return {
        found: true,
        title: (await heading.innerText().catch(() => ref.title)).trim(),
        price: priceMatch ? Number(priceMatch[0].replace(/[^0-9.]/g, '')) : undefined,
        url,
        checkedAt: new Date().toISOString(),
      };
    }
  }
  return findInYourListings(page, ref.title);
}
