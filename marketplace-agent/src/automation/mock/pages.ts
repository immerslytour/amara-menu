/**
 * HTML for the fake Marketplace. Deliberately shaped like a real social-network
 * marketplace: semantic roles, labelled inputs, real buttons - so the adapter
 * must use accessible selectors rather than coordinates.
 */
import type { MockListing, MockThread } from './store';

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
 body{font-family:system-ui,sans-serif;margin:0;background:#f0f2f5;color:#1c1e21}
 header{background:#fff;padding:10px 16px;border-bottom:1px solid #dadde1;display:flex;gap:16px;align-items:center}
 main{max-width:840px;margin:24px auto;background:#fff;padding:24px;border-radius:8px}
 label{display:block;margin:14px 0 4px;font-weight:600;font-size:13px}
 input,textarea,select{width:100%;padding:8px;border:1px solid #ccd0d5;border-radius:6px;font-size:14px}
 button{background:#1877f2;color:#fff;border:0;padding:9px 16px;border-radius:6px;font-weight:600;cursor:pointer}
 button.secondary{background:#e4e6eb;color:#1c1e21}
 a{color:#1877f2}
 .row{display:flex;gap:12px;margin-top:18px}
 .card{border:1px solid #dadde1;border-radius:8px;padding:12px;margin-bottom:10px}
 .msg{padding:8px 12px;border-radius:14px;margin:6px 0;max-width:70%}
 .msg.buyer{background:#e4e6eb}
 .msg.seller{background:#1877f2;color:#fff;margin-left:auto}
 .pill{font-size:12px;background:#e7f3ff;color:#1877f2;padding:2px 8px;border-radius:10px}
</style></head>
<body>
<header>
  <strong>Mockbook</strong>
  <nav><a href="/marketplace">Marketplace</a> &nbsp; <a href="/messages">Messages</a></nav>
</header>
${body}
</body></html>`;
}

export function loginPage(): string {
  return layout(
    'Log in',
    `<main>
      <h1>Log into Mockbook</h1>
      <p>You are not logged in.</p>
      <form method="POST" action="/mock/login">
        <button type="submit">Log In</button>
      </form>
    </main>`,
  );
}

export function verificationPage(): string {
  return layout(
    'Security check',
    `<main>
      <h1>Security check required</h1>
      <p>We need to confirm it's you before you continue.</p>
      <p>Please complete this verification to continue.</p>
      <form method="POST" action="/mock/verify"><button type="submit">Continue</button></form>
    </main>`,
  );
}

export function marketplaceHome(listings: MockListing[], breakCreateFlow = false): string {
  return layout(
    'Marketplace',
    `<main>
      <h1>Marketplace</h1>
      <div class="row">${
        breakCreateFlow
          ? '<span>Listing creation is temporarily unavailable.</span>'
          : '<a href="/marketplace/create"><button type="button">Create new listing</button></a>'
      }</div>
      <h2>Your listings</h2>
      ${
        listings.length
          ? listings
              .map(
                (l) =>
                  `<div class="card"><a href="/marketplace/item/${l.id}">${escape(l.title)}</a> — $${l.price}</div>`,
              )
              .join('')
          : '<p>No listings yet.</p>'
      }
    </main>`,
  );
}

export function chooseTypePage(): string {
  return layout(
    'Choose listing type',
    `<main>
      <h1>Choose listing type</h1>
      <div class="card"><a href="/marketplace/create/item"><button type="button">Item for sale</button></a>
        <p>Create a single listing for one or more items to sell.</p></div>
      <div class="card"><button type="button" disabled>Vehicle for sale</button></div>
      <div class="card"><button type="button" disabled>Home for sale or rent</button></div>
    </main>`,
  );
}

export function createItemPage(): string {
  return layout(
    'Item for sale',
    `<main>
      <h1>Item for sale</h1>
      <form id="listing-form">
        <label for="photos">Photos</label>
        <input id="photos" name="photos" type="file" multiple accept="image/*" aria-label="Add photos">
        <div id="photo-count" data-testid="photo-count">0 photos selected</div>

        <label for="title">Title</label>
        <input id="title" name="title" type="text" aria-label="Title" required>

        <label for="price">Price</label>
        <input id="price" name="price" type="text" inputmode="decimal" aria-label="Price" required>

        <label for="category">Category</label>
        <select id="category" name="category" aria-label="Category">
          <option>Electronics</option><option>Home Goods</option><option>Furniture</option>
          <option>Clothing</option><option>Sporting Goods</option><option>Other</option>
        </select>

        <label for="location">Location</label>
        <input id="location" name="location" type="text" aria-label="Location" required>

        <label for="description">Description</label>
        <textarea id="description" name="description" rows="6" aria-label="Description"></textarea>

        <div class="row"><button type="button" id="next-btn">Next</button></div>
      </form>

      <section id="review" hidden aria-label="Review your listing">
        <h2>Review your listing</h2>
        <div id="review-body"></div>
        <div class="row">
          <button type="button" class="secondary" id="back-btn">Back</button>
          <button type="button" id="publish-btn">Publish</button>
        </div>
      </section>

      <script>
        const form = document.getElementById('listing-form');
        const review = document.getElementById('review');
        const photos = document.getElementById('photos');
        let photoNames = [];
        photos.addEventListener('change', () => {
          photoNames = Array.from(photos.files).map(f => f.name);
          document.getElementById('photo-count').textContent = photoNames.length + ' photos selected';
        });
        function payload() {
          return {
            title: document.getElementById('title').value.trim(),
            price: document.getElementById('price').value.trim(),
            category: document.getElementById('category').value,
            location: document.getElementById('location').value.trim(),
            description: document.getElementById('description').value.trim(),
            photos: photoNames,
          };
        }
        document.getElementById('next-btn').addEventListener('click', () => {
          const p = payload();
          if (!p.title || !p.price || !p.location) { alert('Missing required fields'); return; }
          document.getElementById('review-body').innerHTML =
            '<p><strong>' + p.title + '</strong></p><p>$' + p.price + '</p>' +
            '<p>' + p.location + ' · ' + p.category + '</p>' +
            '<p>' + p.photos.length + ' photos</p><pre style="white-space:pre-wrap">' + p.description + '</pre>';
          form.hidden = true; review.hidden = false;
        });
        document.getElementById('back-btn').addEventListener('click', () => {
          form.hidden = false; review.hidden = true;
        });
        document.getElementById('publish-btn').addEventListener('click', async () => {
          const res = await fetch('/mock/api/listings', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload()),
          });
          const json = await res.json();
          if (json.id) location.href = '/marketplace/item/' + json.id;
          else alert('Publish failed');
        });
      </script>
    </main>`,
  );
}

export function itemPage(l: MockListing): string {
  return layout(
    l.title,
    `<main data-testid="listing-detail" data-listing-id="${l.id}" data-sold="${l.sold ? '1' : '0'}">
      <span class="pill" data-testid="listing-state">${l.sold ? 'Sold' : 'Listed'}</span>
      <h1 data-testid="listing-title">${escape(l.title)}</h1>
      <p data-testid="listing-price">$${l.price}</p>
      <p>${escape(l.location)} · ${escape(l.category)}</p>
      <p data-testid="listing-photos">${l.photos.length} photos</p>
      <h2>Description</h2>
      <pre data-testid="listing-description" style="white-space:pre-wrap">${escape(l.description)}</pre>
      ${
        l.sold
          ? '<p data-testid="sold-banner">This listing is marked as sold.</p>'
          : `<div class="row"><button type="button" id="sold-btn">Mark as sold</button></div>
      <script>
        document.getElementById('sold-btn').addEventListener('click', async () => {
          const res = await fetch('/mock/api/listings/${l.id}/sold', { method: 'POST' });
          if (res.ok) location.reload(); else alert('Could not mark sold');
        });
      </script>`
      }
    </main>`,
  );
}

export function inboxPage(threads: MockThread[], hideListingId = false): string {
  return layout(
    'Messages',
    `<main>
      <h1>Messages</h1>
      <ul aria-label="Conversations" style="list-style:none;padding:0">
      ${
        threads.length
          ? threads
              .map(
                (t) => `<li class="card" data-testid="thread-row" data-thread-id="${t.id}">
          <a href="/messages/t/${t.id}" data-testid="thread-link">
            <strong data-testid="thread-buyer">${escape(t.buyerName)}</strong></a>
          <div data-testid="thread-listing"${hideListingId ? '' : ` data-listing-id="${t.listingId ?? ''}"`}>${escape(t.listingTitle || 'Unknown item')}</div>
          <div data-testid="thread-preview">${escape(t.messages[t.messages.length - 1]?.text || '')}</div>
          ${t.unread ? '<span class="pill" data-testid="thread-unread">Unread</span>' : ''}
        </li>`,
              )
              .join('')
          : '<p>No conversations.</p>'
      }
      </ul>
    </main>`,
  );
}

export function threadPage(t: MockThread): string {
  return layout(
    `Chat with ${t.buyerName}`,
    `<main data-testid="thread-detail" data-thread-id="${t.id}">
      <h1>${escape(t.buyerName)}</h1>
      <div data-testid="thread-listing" data-listing-id="${t.listingId ?? ''}">${escape(t.listingTitle || 'Unknown item')}</div>
      <div role="log" aria-label="Messages" data-testid="message-list">
        ${t.messages
          .map(
            (m) =>
              `<div class="msg ${m.sender === 'BUYER' ? 'buyer' : 'seller'}" data-testid="message"
                 data-message-id="${m.id}" data-sender="${m.sender}" data-ts="${m.timestamp}">${escape(m.text)}</div>`,
          )
          .join('')}
      </div>
      <label for="reply">Message</label>
      <textarea id="reply" aria-label="Message" rows="3"></textarea>
      <div class="row"><button type="button" id="send-btn">Send</button></div>
      <script>
        document.getElementById('send-btn').addEventListener('click', async () => {
          const box = document.getElementById('reply');
          const text = box.value.trim();
          if (!text) return;
          const res = await fetch('/mock/api/threads/${t.id}/send', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          if (res.ok) { box.value = ''; location.reload(); }
          else alert('Send failed');
        });
      </script>
    </main>`,
  );
}

function escape(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
