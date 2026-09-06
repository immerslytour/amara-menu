/**
 * Offline checks for the Facebook adapter's login / security-challenge
 * detection. Real Facebook pages are never contacted: synthetic pages that
 * mimic the states we must recognise are loaded into a real browser.
 *
 *   npx tsx scripts/test-facebook-detection.ts
 */
import { chromium } from 'playwright';
import { checkReady, detectChallenge, isLoggedOut } from '@/automation/facebook/verification';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

const LOGIN_PAGE = `<!doctype html><html><body>
  <form>
    <input type="text" name="email" placeholder="Email or phone number">
    <input type="password" name="pass" placeholder="Password">
    <button type="submit">Log In</button>
  </form>
  <a href="#">Create new account</a>
</body></html>`;

const CHECKPOINT_PAGE = `<!doctype html><html><body>
  <h1>We need to confirm it's you</h1>
  <p>Enter the login code we sent to your phone.</p>
</body></html>`;

const CAPTCHA_PAGE = `<!doctype html><html><body>
  <h1>Marketplace</h1>
  <iframe src="https://www.google.com/recaptcha/api2/anchor" title="reCAPTCHA"></iframe>
</body></html>`;

const TWO_FACTOR_PAGE = `<!doctype html><html><body>
  <h2>Two-factor authentication required</h2>
  <input type="text" aria-label="Code">
</body></html>`;

const MARKETPLACE_PAGE = `<!doctype html><html><body>
  <h1>Marketplace</h1>
  <a href="/marketplace/create/item">Create new listing</a>
  <div>Today's picks</div>
</body></html>`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(LOGIN_PAGE);
  check('detects the logged-out login form', await isLoggedOut(page));
  const loginReady = await checkReady(page);
  check(
    'reports NOT_LOGGED_IN and asks the user to log in themselves',
    !loginReady.ready && loginReady.reason === 'NOT_LOGGED_IN',
    JSON.stringify(loginReady),
  );
  check(
    'the login message tells the user to log in in the browser',
    !loginReady.ready && /log into facebook in the browser/i.test(loginReady.detail),
  );

  await page.setContent(CHECKPOINT_PAGE);
  check('detects a "confirm it\'s you" checkpoint', !!(await detectChallenge(page)));
  const cpReady = await checkReady(page);
  check(
    'reports VERIFICATION_REQUIRED for the checkpoint',
    !cpReady.ready && cpReady.reason === 'VERIFICATION_REQUIRED',
    JSON.stringify(cpReady),
  );
  check(
    'tells the user to complete verification manually',
    !cpReady.ready && /complete it in the browser, then resume the agent/i.test(cpReady.detail),
  );

  await page.setContent(CAPTCHA_PAGE);
  check('detects a CAPTCHA frame', /captcha/i.test((await detectChallenge(page)) || ''));
  const capReady = await checkReady(page);
  check('pauses on CAPTCHA instead of attempting it', !capReady.ready && capReady.reason === 'VERIFICATION_REQUIRED');

  await page.setContent(TWO_FACTOR_PAGE);
  check('detects two-factor prompts', !!(await detectChallenge(page)));

  await page.setContent(MARKETPLACE_PAGE);
  check('a normal Marketplace page is not flagged as logged out', !(await isLoggedOut(page)));
  check('a normal Marketplace page has no challenge', (await detectChallenge(page)) === null);
  const okReady = await checkReady(page);
  check('a normal Marketplace page is ready', okReady.ready, JSON.stringify(okReady));

  await page.goto('data:text/html,<h1>hi</h1>');
  await browser.close();
  console.log(failures === 0 ? '\nFacebook detection checks passed.\n' : `\n${failures} check(s) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
