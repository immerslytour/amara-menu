'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { post } from '@/lib/useAppState';
import { Badge, Button, Card, SectionTitle } from '@/components/ui';
import type { Listing, Product } from '@/lib/types';

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/products/${id}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok) {
      setProduct(json.product);
      setListing(json.listing);
      setDraftTitle((prev) => prev || json.product.generatedTitle || '');
      setDraftDescription((prev) => prev || json.product.generatedDescription || '');
    }
  }, [id]);

  const generate = useCallback(async () => {
    setBusy('generate');
    setError(null);
    try {
      const json = await post(`/api/products/${id}/action`, { action: 'generate' });
      setDraftTitle(json.draft.title);
      setDraftDescription(json.draft.description);
      setWarnings(json.draft.warnings || []);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [id, load]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  // Coming straight from "Start Selling": draft the listing right away.
  const [autoRan, setAutoRan] = useState(false);
  useEffect(() => {
    if (!autoRan && product && search.get('generate') === '1' && !product.generatedTitle) {
      setAutoRan(true);
      generate();
    }
  }, [autoRan, product, search, generate]);

  if (!product) return <p className="text-slate-500">Loading…</p>;

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      await post(`/api/products/${id}/action`, { action, ...body });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const approved = !!product.approvedAt;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">{product.title}</h1>
        <Badge status={product.status} />
        <span className="text-sm text-slate-400">
          ${product.askingPrice} · minimum ${product.minimumPrice}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={busy === 'toggleAi'} onClick={() => act('toggleAi')}>
            AI {product.aiEnabled ? 'ON' : 'OFF'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy === 'setStatus'}
            onClick={() => act('setStatus', { status: product.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED' })}
          >
            {product.status === 'PAUSED' ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="secondary" disabled={busy === 'setStatus'} onClick={() => act('setStatus', { status: 'SOLD' })}>
            Mark Sold
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">{error}</p>
      )}

      {product.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {product.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p} src={`/api/uploads/${p}`} alt="" className="h-24 w-24 rounded border border-line object-cover" />
          ))}
        </div>
      )}

      <Card>
        <SectionTitle>AI-GENERATED LISTING</SectionTitle>
        <p className="mb-3 text-xs text-slate-500">
          Claude rewrites your own text only. Review it before it goes live.
        </p>
        <label className="mb-1 block text-xs font-semibold text-slate-400">Marketplace title</label>
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className="mb-3 w-full rounded border border-line bg-[#0f1115] px-3 py-2 text-sm text-white"
        />
        <label className="mb-1 block text-xs font-semibold text-slate-400">Marketplace description</label>
        <textarea
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          rows={7}
          className="w-full rounded border border-line bg-[#0f1115] px-3 py-2 text-sm text-white"
        />

        {warnings.length > 0 && (
          <ul className="mt-3 rounded border border-amber-800 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy === 'generate'} onClick={generate}>
            {busy === 'generate' ? 'Generating…' : 'Regenerate with Claude'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy === 'saveDraft'}
            onClick={() => act('saveDraft', { title: draftTitle, description: draftDescription })}
          >
            Save edits
          </Button>
          <Button
            disabled={!draftTitle || busy === 'approveAndPublish'}
            onClick={async () => {
              await act('saveDraft', { title: draftTitle, description: draftDescription });
              await act('approveAndPublish');
            }}
          >
            Approve &amp; Publish
          </Button>
        </div>
        {approved && (
          <p className="mt-2 text-xs text-emerald-400">
            Approved {new Date(product.approvedAt!).toLocaleString()}
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle>LISTING STATUS</SectionTitle>
        {!listing ? (
          <p className="text-sm text-slate-500">Not published yet.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <Badge status={listing.status} />
              <span className="text-slate-400">{listing.platform}</span>
              {listing.publishedAt && (
                <span className="text-slate-500">published {new Date(listing.publishedAt).toLocaleString()}</span>
              )}
            </div>
            {listing.externalUrl && (
              <p className="break-all text-sky-400">
                {listing.externalUrl} {listing.externalId ? `(id ${listing.externalId})` : ''}
              </p>
            )}
            {listing.errorMessage && (
              <div className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-rose-200">
                <p className="font-semibold">Automation stopped</p>
                <p className="mt-1">{listing.errorMessage}</p>
                {listing.screenshotPath && (
                  <p className="mt-1 text-xs text-rose-300/80">Screenshot: {listing.screenshotPath}</p>
                )}
                {listing.htmlPath && <p className="text-xs text-rose-300/80">HTML: {listing.htmlPath}</p>}
                <div className="mt-2">
                  <Button variant="secondary" disabled={busy === 'retryPublish'} onClick={() => act('retryPublish')}>
                    Retry action
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs text-slate-500">Attempts: {listing.attempts}</p>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>SELLER DETAILS</SectionTitle>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancel' : 'Edit'}
            </Button>
            <Button
              variant="danger"
              disabled={busy === 'delete'}
              onClick={async () => {
                if (!confirm(`Delete "${product!.title}"? This cannot be undone.`)) return;
                setBusy('delete');
                setError(null);
                try {
                  const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || 'Could not delete.');
                  window.location.href = '/products';
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>

        {notes.length > 0 && (
          <ul className="mb-3 rounded border border-amber-800 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        {editing ? (
          <EditForm
            product={product}
            busy={busy === 'edit'}
            onCancel={() => setEditing(false)}
            onSave={async (patch) => {
              setBusy('edit');
              setError(null);
              setNotes([]);
              try {
                const res = await fetch(`/api/products/${id}`, {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(patch),
                });
                const json = await res.json();
                if (!res.ok) throw new Error((json.errors || [json.error]).join(' '));
                setNotes(json.warnings || []);
                setEditing(false);
                await load();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(null);
              }
            }}
          />
        ) : (
          <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
            <dt className="text-slate-500">Your description</dt>
            <dd className="whitespace-pre-wrap text-slate-200">{product.description || '—'}</dd>
            <dt className="text-slate-500">Asking / minimum</dt>
            <dd className="text-slate-200">
              ${product.askingPrice} / ${product.minimumPrice}
            </dd>
            <dt className="text-slate-500">Pickup area</dt>
            <dd className="text-slate-200">{product.pickupArea}</dd>
            <dt className="text-slate-500">Availability</dt>
            <dd className="text-slate-200">{product.availability || '—'}</dd>
            <dt className="text-slate-500">Category</dt>
            <dd className="text-slate-200">{product.category}</dd>
            <dt className="text-slate-500">Condition</dt>
            <dd className="text-slate-200">{product.condition}</dd>
          </dl>
        )}
      </Card>
    </div>
  );
}

const CATEGORIES = ['Electronics', 'Home Goods', 'Furniture', 'Clothing', 'Sporting Goods', 'Other'];
const CONDITIONS = ['New', 'Used - like new', 'Used - good', 'Used - fair'];
const editInput =
  'w-full rounded border border-line bg-[#0f1115] px-3 py-2 text-sm text-white outline-none focus:border-blue-500';

function EditForm({
  product,
  busy,
  onSave,
  onCancel,
}: {
  product: Product;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        onSave(Object.fromEntries(data.entries()));
      }}
    >
      <Labelled label="Title">
        <input name="title" defaultValue={product.title} className={editInput} />
      </Labelled>
      <Labelled label="Description">
        <textarea name="description" rows={4} defaultValue={product.description} className={editInput} />
      </Labelled>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Asking price ($)">
          <input name="askingPrice" type="number" min="1" defaultValue={product.askingPrice} className={editInput} />
        </Labelled>
        <Labelled label="Minimum price ($)">
          <input name="minimumPrice" type="number" min="1" defaultValue={product.minimumPrice} className={editInput} />
        </Labelled>
      </div>
      <Labelled label="Pickup area">
        <input name="pickupArea" defaultValue={product.pickupArea} className={editInput} />
      </Labelled>
      <Labelled label="Availability">
        <input name="availability" defaultValue={product.availability} className={editInput} />
      </Labelled>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Category">
          <select name="category" defaultValue={product.category} className={editInput}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Condition">
          <select name="condition" defaultValue={product.condition} className={editInput}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Labelled>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}
