import { useMemo } from 'react';

const INK = '#272238';

interface ArtProps {
  className?: string;
}

/** "Prakash", the smiling book mascot. */
export function BookBuddy({ className = 'h-24 w-24', mood = 'happy' }: ArtProps & { mood?: 'happy' | 'wow' | 'sleepy' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <ellipse cx="60" cy="110" rx="36" ry="5" fill={INK} opacity=".1" />
      <path d="M12 36 Q60 22 108 36 L108 98 Q60 86 12 98 Z" fill="#f05f05" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M18 32 Q40 24 60 35 L60 92 Q40 82 18 88 Z" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M102 32 Q80 24 60 35 L60 92 Q80 82 102 88 Z" fill="#fffbea" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M26 76 Q40 71 52 77 M68 77 Q80 71 94 76" stroke="#ffcf9f" strokeWidth="3" strokeLinecap="round" fill="none" />
      {mood === 'sleepy' ? (
        <path d="M38 55 Q44 59 50 55 M70 55 Q76 59 82 55" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      ) : (
        <g className="animate-blink" style={{ transformOrigin: '60px 54px', transformBox: 'fill-box' }}>
          <ellipse cx="44" cy="54" rx="5" ry={mood === 'wow' ? 7.5 : 6.5} fill={INK} />
          <ellipse cx="76" cy="54" rx="5" ry={mood === 'wow' ? 7.5 : 6.5} fill={INK} />
          <circle cx="46" cy="51" r="1.8" fill="#fff" />
          <circle cx="78" cy="51" r="1.8" fill="#fff" />
        </g>
      )}
      <circle cx="34" cy="66" r="5.5" fill="#f9a8d4" opacity=".9" />
      <circle cx="86" cy="66" r="5.5" fill="#f9a8d4" opacity=".9" />
      {mood === 'wow' ? (
        <ellipse cx="60" cy="69" rx="5" ry="6" fill={INK} />
      ) : (
        <path d="M51 66 Q60 76 69 66" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      )}
      <path d="M60 4 L63.5 12.5 L72 13 L65.5 18.5 L67.5 27 L60 22.5 L52.5 27 L54.5 18.5 L48 13 L56.5 12.5 Z" fill="#ffc41f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/** A child reading. Balak in blue with a hair tuft, Balika in pink with ponytails and bows. */
export function KidReader({ className = 'h-28 w-24', variant = 'balak' }: ArtProps & { variant?: 'balak' | 'balika' }) {
  const shirt = variant === 'balak' ? '#33a5ff' : '#ec4899';
  const hair = '#3b2a20';
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden>
      <ellipse cx="60" cy="134" rx="32" ry="4.5" fill={INK} opacity=".1" />
      <rect x="32" y="82" width="56" height="46" rx="20" fill={shirt} stroke={INK} strokeWidth="3" />
      {variant === 'balika' && (
        <>
          <circle cx="29" cy="58" r="11" fill={hair} stroke={INK} strokeWidth="3" />
          <circle cx="91" cy="58" r="11" fill={hair} stroke={INK} strokeWidth="3" />
          <path d="M22 44 L30 49 L22 54 Z M38 44 L30 49 L38 54 Z" fill="#ffc41f" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M82 44 L90 49 L82 54 Z M98 44 L90 49 L98 54 Z" fill="#ffc41f" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </>
      )}
      <circle cx="60" cy="58" r="27" fill="#f6c49a" stroke={INK} strokeWidth="3" />
      <path d="M33 54 Q34 28 60 28 Q86 28 87 54 Q78 42 64 43 Q48 41 33 54 Z" fill={hair} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      {variant === 'balak' && <path d="M56 29 Q60 16 70 22 Q63 23 62 30" fill={hair} stroke={INK} strokeWidth="3" strokeLinejoin="round" />}
      <g className="animate-blink" style={{ transformOrigin: '60px 60px', transformBox: 'fill-box' }}>
        <circle cx="49" cy="60" r="3.6" fill={INK} />
        <circle cx="71" cy="60" r="3.6" fill={INK} />
      </g>
      <circle cx="43" cy="69" r="4.5" fill="#f9a8d4" opacity=".9" />
      <circle cx="77" cy="69" r="4.5" fill="#f9a8d4" opacity=".9" />
      <path d="M52 70 Q60 78 68 70" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M34 98 L60 104 L86 98 L86 120 L60 126 L34 120 Z" fill="#ffc41f" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M60 104 L60 126" stroke={INK} strokeWidth="3" />
      <path d="M40 106 L54 109 M66 109 L80 106" stroke="#f05f05" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="36" cy="110" r="6.5" fill="#f6c49a" stroke={INK} strokeWidth="3" />
      <circle cx="84" cy="110" r="6.5" fill="#f6c49a" stroke={INK} strokeWidth="3" />
    </svg>
  );
}

export function Sun({ className = 'h-16 w-16' }: ArtProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <g stroke="#f9a806" strokeWidth="6" strokeLinecap="round">
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={50 + Math.cos(a) * 34} y1={50 + Math.sin(a) * 34} x2={50 + Math.cos(a) * 46} y2={50 + Math.sin(a) * 46} />;
        })}
      </g>
      <circle cx="50" cy="50" r="24" fill="#ffd546" stroke={INK} strokeWidth="3" />
      <circle cx="42" cy="47" r="2.8" fill={INK} />
      <circle cx="58" cy="47" r="2.8" fill={INK} />
      <path d="M43 56 Q50 62 57 56" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Cloud({ className = 'h-12 w-20', color = '#ffffff' }: ArtProps & { color?: string }) {
  return (
    <svg viewBox="0 0 120 64" className={className} aria-hidden>
      <path
        d="M24 56 Q6 56 8 40 Q10 26 26 28 Q30 10 50 12 Q66 4 76 20 Q96 14 100 32 Q116 34 112 48 Q110 58 96 56 Z"
        fill={color}
        stroke={INK}
        strokeOpacity=".15"
        strokeWidth="3"
      />
    </svg>
  );
}

export function Star({ className = 'h-6 w-6', color = '#ffc41f' }: ArtProps & { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 1.5 L14.8 8.6 L22.5 9.2 L16.6 14.1 L18.5 21.6 L12 17.5 L5.5 21.6 L7.4 14.1 L1.5 9.2 L9.2 8.6 Z" fill={color} />
    </svg>
  );
}

/** Floating background shapes for hero areas. */
export function Doodles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <Star className="absolute left-[6%] top-[14%] h-6 w-6 animate-float" color="#ffc41f" />
      <Star className="absolute right-[10%] top-[22%] h-4 w-4 animate-float-slow" color="#ec4899" />
      <Star className="absolute bottom-[18%] left-[14%] h-5 w-5 animate-float-slow" color="#33a5ff" />
      <Star className="absolute bottom-[12%] right-[18%] h-7 w-7 animate-float" color="#12c85f" />
      <span className="absolute right-[30%] top-[8%] h-3 w-3 rounded-full bg-grape-300 animate-float" />
      <span className="absolute left-[30%] bottom-[8%] h-2.5 w-2.5 rounded-full bg-saffron-300 animate-float-slow" />
    </div>
  );
}

const CONFETTI_COLORS = ['#ff7a1a', '#ec4899', '#33a5ff', '#12c85f', '#ffc41f', '#925cf6'];

/** One-off confetti burst; mount it to celebrate. */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }).map((_, i) => ({
        left: `${(i * 97) % 100}%`,
        delay: `${(i % 9) * 0.06}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + (i % 4) * 2,
        round: i % 3 === 0,
      })),
    [pieces],
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute top-0 animate-confetti"
          style={{
            left: b.left,
            width: b.size,
            height: b.round ? b.size : b.size * 1.6,
            background: b.color,
            borderRadius: b.round ? 999 : 2,
            animationDelay: b.delay,
          }}
        />
      ))}
    </div>
  );
}
