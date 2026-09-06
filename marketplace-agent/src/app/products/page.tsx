'use client';

import Link from 'next/link';
import { useAppState } from '@/lib/useAppState';
import { Badge, Card, Empty, LinkButton, SectionTitle } from '@/components/ui';

export default function ProductsPage() {
  const { state } = useAppState();
  if (!state) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionTitle>PRODUCTS</SectionTitle>
        <LinkButton href="/products/new">+ Add Product</LinkButton>
      </div>

      {state.products.length === 0 ? (
        <Empty>No products yet.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {state.products.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`}>
              <Card className="h-full hover:border-slate-600">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{p.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      ${p.askingPrice} · min ${p.minimumPrice}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{p.pickupArea}</p>
                  </div>
                  <Badge status={p.status} />
                </div>
                {p.listing?.errorMessage && (
                  <p className="mt-3 rounded bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
                    {p.listing.errorMessage}
                  </p>
                )}
                {p.listing?.externalUrl && (
                  <p className="mt-3 truncate text-xs text-sky-400">{p.listing.externalUrl}</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
