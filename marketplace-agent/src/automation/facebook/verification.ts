import type { Page } from 'playwright';
import { CHALLENGE_PROBES, LOGGED_OUT_PROBES } from './selectors';
import type { ReadyState } from '../MarketplaceAdapter';

/**
 * Detects login and security-challenge states. This module NEVER attempts to
 * solve a challenge, defeat a CAPTCHA, or work around MFA - it only reports so
 * the human can complete it in the browser.
 */

export async function isLoggedOut(page: Page): Promise<boolean> {
  if (/\/login/i.test(page.url())) return true;
  const email = page.locator(LOGGED_OUT_PROBES.emailField);
  const pass = page.locator(LOGGED_OUT_PROBES.passwordField);
  if ((await email.count()) > 0 && (await pass.count()) > 0) {
    return await email.first().isVisible().catch(() => false);
  }
  return false;
}

export async function detectChallenge(page: Page): Promise<string | null> {
  const url = page.url();
  for (const re of CHALLENGE_PROBES.urlPatterns) {
    if (re.test(url)) return `Facebook redirected to a security checkpoint (${url}).`;
  }
  if ((await page.locator(CHALLENGE_PROBES.captchaFrame).count()) > 0) {
    return 'Facebook is showing a CAPTCHA.';
  }
  let bodyText = '';
  try {
    bodyText = (await page.locator('body').innerText({ timeout: 3000 })).slice(0, 6000);
  } catch {
    return null;
  }
  for (const re of CHALLENGE_PROBES.textPatterns) {
    if (re.test(bodyText)) return `Facebook is showing a verification step: "${re.source}".`;
  }
  return null;
}

/** Combined check used before every automated action. */
export async function checkReady(page: Page): Promise<ReadyState> {
  if (await isLoggedOut(page)) {
    return {
      ready: false,
      reason: 'NOT_LOGGED_IN',
      detail: 'Log into Facebook in the browser window. When you are finished, return here.',
    };
  }
  const challenge = await detectChallenge(page);
  if (challenge) {
    return {
      ready: false,
      reason: 'VERIFICATION_REQUIRED',
      detail: `${challenge} Facebook requires manual verification. Complete it in the browser, then resume the agent.`,
    };
  }
  return { ready: true };
}
