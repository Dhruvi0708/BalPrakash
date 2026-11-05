import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { CATEGORY_LABEL, type Category } from '../lib/types';
import { BookBuddy, KidReader } from './Art';

/** QR payload volunteers scan at distribution. */
export function cardPayload(code: string): string {
  return `BP:${code}`;
}

export function parseCardPayload(text: string): string | null {
  const m = /^BP:([A-Z0-9]{8})$/i.exec(text.trim());
  if (m) return m[1].toUpperCase();
  return /^[A-Z0-9]{8}$/i.test(text.trim()) ? text.trim().toUpperCase() : null;
}

export function QrImage({ value, className = 'h-40 w-40' }: { value: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 320, color: { dark: '#272238', light: '#ffffff' } }).then(setSrc, () => setSrc(null));
  }, [value]);
  return src ? <img src={src} alt={`QR code ${value}`} className={className} /> : <div className={`${className} animate-pulse rounded-xl bg-ink-800/5`} />;
}

/** A printable, kid-friendly member card. */
export function MemberCard({ name, phone, category, code }: { name: string; phone: string; category: Category; code: string }) {
  const balika = category === 'balika';
  return (
    <div
      className={`relative overflow-hidden rounded-4xl border-4 border-white p-5 text-white shadow-soft ${
        balika ? 'bg-gradient-to-br from-bubble-400 via-bubble-500 to-grape-500' : 'bg-gradient-to-br from-sky2-400 via-sky2-500 to-grape-500'
      }`}
    >
      <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15" />
      <span className="absolute -bottom-8 left-10 h-20 w-20 rounded-full bg-sunny-300/30" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookBuddy className="h-10 w-10" />
          <div className="leading-tight">
            <div className="text-xs font-bold uppercase tracking-widest opacity-90">Bal Prakash Delhi</div>
            <div className="text-xs font-bold opacity-80">Member card</div>
          </div>
        </div>
        <KidReader variant={category} className="h-14 w-12" />
      </div>
      <div className="relative mt-3 flex items-center gap-4">
        <div className="rounded-2xl bg-white p-2 shadow-pop">
          <QrImage value={cardPayload(code)} className="h-28 w-28" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-2xl font-extrabold leading-tight">{name}</div>
          <div className="text-sm font-bold opacity-90">{CATEGORY_LABEL[category]} · {phone}</div>
          <div className="mt-2 inline-block rounded-full bg-white/25 px-3 py-0.5 font-mono text-sm font-bold tracking-widest">{code}</div>
        </div>
      </div>
    </div>
  );
}
