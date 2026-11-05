import QrScannerLib from 'qr-scanner';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { parseCardPayload } from './MemberCard';

/** Camera QR scanner with a manual code box as fallback. Calls onCode with the 8-letter card code. */
export function QrScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!videoRef.current) return;
    const scanner = new QrScannerLib(
      videoRef.current,
      (result) => {
        const code = parseCardPayload(result.data);
        if (!code) return;
        const now = Date.now();
        // The camera reports the same code many times a second; act once per 3 s.
        if (code === last.current.code && now - last.current.at < 3000) return;
        last.current = { code, at: now };
        navigator.vibrate?.(60);
        onCode(code);
      },
      { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
    );
    scanner.start().catch(() => setError('Camera not available. Allow camera access, or type the code below.'));
    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, [onCode]);

  function submitManual(e: FormEvent) {
    e.preventDefault();
    const code = parseCardPayload(manual);
    if (!code) return setError('Card codes have 8 letters/numbers.');
    setError(null);
    setManual('');
    onCode(code);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-3xl border-4 border-sunny-300 bg-ink-900">
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      </div>
      {error && <p className="alert-error">{error}</p>}
      <form onSubmit={submitManual} className="flex gap-2">
        <input className="input font-mono uppercase" placeholder="Or type card code" maxLength={11} value={manual} onChange={(e) => setManual(e.target.value)} />
        <button type="submit" className="btn-sky shrink-0">Find</button>
      </form>
    </div>
  );
}
