'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, SectionTitle } from '@/components/ui';

const CATEGORIES = ['Electronics', 'Home Goods', 'Furniture', 'Clothing', 'Sporting Goods', 'Other'];
// Facebook's own condition values - it requires one for "Item for sale".
const CONDITIONS = ['New', 'Used - like new', 'Used - good', 'Used - fair'];

export default function NewProductPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch('/api/products', { method: 'POST', body: new FormData(e.currentTarget) });
      const json = await res.json();
      if (!res.ok) {
        setErrors(json.errors || [json.error || 'Could not create the product.']);
        return;
      }
      router.push(`/products/${json.product.id}?generate=1`);
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <SectionTitle>ADD PRODUCT</SectionTitle>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Photos">
            <input
              type="file"
              name="photos"
              multiple
              accept="image/*"
              className="w-full text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:text-white"
            />
          </Field>
          <Field label="Product title">
            <input name="title" required className={input} placeholder="PlayStation 5 Disc Edition" />
          </Field>
          <Field label="Description">
            <textarea name="description" rows={4} className={input} placeholder="Condition, what's included, anything a buyer should know." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Asking price ($)">
              <input name="askingPrice" required type="number" min="1" step="1" className={input} placeholder="450" />
            </Field>
            <Field label="Minimum price ($)">
              <input name="minimumPrice" required type="number" min="1" step="1" className={input} placeholder="400" />
            </Field>
          </div>
          <Field label="Pickup area">
            <input name="pickupArea" required className={input} placeholder="North Austin, TX" />
          </Field>
          <Field label="Availability (optional)">
            <input name="availability" className={input} placeholder="Weekday evenings and weekends" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <select name="category" className={input} defaultValue="Electronics">
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select name="condition" className={input} defaultValue="Used - good">
                {CONDITIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>

          {errors.length > 0 && (
            <ul className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Start Selling'}
          </Button>
          <p className="text-xs text-slate-500">
            The agent never accepts less than your minimum price, and never shares your exact address.
          </p>
        </form>
      </Card>
    </div>
  );
}

const input =
  'w-full rounded border border-line bg-[#0f1115] px-3 py-2 text-sm text-white outline-none focus:border-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}
