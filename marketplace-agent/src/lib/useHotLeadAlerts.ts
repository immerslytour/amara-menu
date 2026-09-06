'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConversationView } from './useAppState';

/**
 * Notifies the human the moment a conversation turns into a hot lead, so they
 * do not have to be watching the dashboard to catch it.
 */
export function useHotLeadAlerts(hotLeads: ConversationView[] | undefined) {
  const seen = useRef<Set<string> | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (typeof Notification === 'undefined') setPermission('unsupported');
    else setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!hotLeads) return;

    // First load just records what is already there - no retro-notifications.
    if (seen.current === null) {
      seen.current = new Set(hotLeads.map((c) => c.id));
      return;
    }

    const fresh = hotLeads.filter((c) => !seen.current!.has(c.id));
    for (const lead of fresh) {
      seen.current.add(lead.id);
      const price = lead.agreedPrice ? ` — $${lead.agreedPrice}` : '';
      const body = `${lead.buyerName} · ${lead.productTitle || 'your item'}${price}`;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('🔥 Ready to close', { body, tag: lead.id });
        } catch {
          /* notifications are best-effort */
        }
      }
      beep();
    }

    // Drop leads that are no longer hot, so a re-escalation notifies again.
    const current = new Set(hotLeads.map((c) => c.id));
    for (const id of [...seen.current]) if (!current.has(id)) seen.current.delete(id);
  }, [hotLeads]);

  return {
    permission,
    async requestPermission() {
      if (typeof Notification === 'undefined') return;
      setPermission(await Notification.requestPermission());
    },
  };
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* audio is best-effort */
  }
}
