/**
 * Every Facebook-specific selector lives here.
 *
 * If Facebook changes its UI, this file (and its siblings in this folder) is
 * the only place that needs editing. Each entry is an ordered list of
 * candidates - the adapter tries them in order and reports a clear error when
 * none of them resolve, rather than clicking blindly.
 */

export const URLS = {
  home: 'https://www.facebook.com/',
  marketplace: 'https://www.facebook.com/marketplace/',
  createItem: 'https://www.facebook.com/marketplace/create/item',
  yourListings: 'https://www.facebook.com/marketplace/you/selling',
  inbox: 'https://www.facebook.com/marketplace/inbox',
  thread: (id: string) => `https://www.facebook.com/messages/t/${id}`,
};

/** Text/regex probes that mean "not logged in". */
export const LOGGED_OUT_PROBES = {
  emailField: 'input[name="email"]',
  passwordField: 'input[name="pass"]',
  loginButtonText: /^log in$/i,
  createAccountText: /create new account/i,
};

/**
 * Security challenges. The agent NEVER tries to solve these - it stops and
 * asks the human to finish them in the browser.
 */
export const CHALLENGE_PROBES = {
  urlPatterns: [/\/checkpoint\//i, /\/challenge\//i, /two_step_verification/i, /login\/device-based/i],
  textPatterns: [
    /we need to confirm/i,
    /confirm your identity/i,
    /security check/i,
    /enter the (login )?code/i,
    /two-factor/i,
    /suspicious activity/i,
    /you'?re temporarily blocked/i,
    /complete a security check/i,
    /solve this puzzle/i,
    /confirm it'?s you/i,
  ],
  captchaFrame: 'iframe[src*="recaptcha"], iframe[title*="captcha" i]',
};

export const LISTING_FORM = {
  /** Entry points into the "create listing" flow. */
  createListingButton: [
    { role: 'link' as const, name: /create new listing/i },
    { role: 'button' as const, name: /create new listing/i },
    { role: 'link' as const, name: /^create listing$/i },
  ],
  itemForSaleOption: [
    { role: 'link' as const, name: /item for sale/i },
    { role: 'button' as const, name: /item for sale/i },
    { role: 'radio' as const, name: /item for sale/i },
  ],
  photoInput: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
  addPhotosButton: [{ role: 'button' as const, name: /add photos/i }],
  title: [
    { label: /^title$/i },
    { label: /^what are you selling/i },
    { placeholder: /^title$/i },
  ],
  price: [{ label: /^price$/i }, { placeholder: /^price$/i }],
  category: [{ label: /^category$/i }],
  condition: [{ label: /^condition$/i }],
  description: [{ label: /^description$/i }, { placeholder: /^description$/i }],
  location: [{ label: /^location$/i }, { placeholder: /^location$/i }],
  nextButton: [{ role: 'button' as const, name: /^next$/i }],
  publishButton: [
    { role: 'button' as const, name: /^publish$/i },
    { role: 'button' as const, name: /^post$/i },
  ],
  /** Shown after a successful publish. */
  publishedProbes: [/your listing is (now )?(published|live)/i, /listing published/i, /marketplace listing/i],
  /** Combobox suggestion list (location/category pickers). */
  optionRole: 'option' as const,
};

export const INBOX = {
  conversationRow: [
    '[aria-label="Conversations" i] [role="row"]',
    '[role="grid"] [role="row"]',
    '[role="navigation"] a[href*="/messages/t/"]',
  ],
  threadLink: 'a[href*="/messages/t/"]',
  messageRow: ['[role="row"]', '[data-testid="message-container"]'],
  messageList: ['[aria-label="Messages" i]', '[role="log"]', '[role="main"]'],
  composer: [
    { label: /^message$/i },
    { placeholder: /^(aa|message|type a message)/i },
    { role: 'textbox' as const, name: /message/i },
  ],
  sendButton: [{ role: 'button' as const, name: /^(send|press enter to send)$/i }],
  /** Element on a thread page identifying the listing being discussed. */
  threadListingLink: 'a[href*="/marketplace/item/"]',
};

export const LISTING_PAGE = {
  titleHeading: ['h1', '[role="main"] h1', 'span[dir="auto"] h1'],
  priceProbe: /\$\s?\d[\d,.]*/,
  itemUrlPattern: /\/marketplace\/item\/(\d+)/,
};
