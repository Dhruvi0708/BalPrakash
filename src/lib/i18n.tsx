import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type UiLang = 'en' | 'gu' | 'hi';

const STRINGS = {
  appName: { en: 'Bal Prakash Delhi', gu: 'બાળ પ્રકાશ દિલ્હી', hi: 'बाल प्रकाश दिल्ली' },
  tagline: { en: 'Read, smile and grow every month!', gu: 'દર મહિને વાંચો, હસો અને મોટા થાઓ!', hi: 'हर महीने पढ़ो, मुस्कुराओ और बढ़ो!' },
  continueGoogle: { en: 'Continue with Google', gu: 'Google થી આગળ વધો', hi: 'Google से आगे बढ़ें' },
  orMobile: { en: 'or use mobile number', gu: 'અથવા મોબાઇલ નંબર વાપરો', hi: 'या मोबाइल नंबर का उपयोग करें' },
  yourName: { en: 'Your name', gu: 'તમારું નામ', hi: 'आपका नाम' },
  mobile: { en: 'Mobile number', gu: 'મોબાઇલ નંબર', hi: 'मोबाइल नंबर' },
  password: { en: 'Password', gu: 'પાસવર્ડ', hi: 'पासवर्ड' },
  signIn: { en: 'Sign in', gu: 'સાઇન ઇન', hi: 'साइन इन' },
  createAccount: { en: 'Create account', gu: 'એકાઉન્ટ બનાવો', hi: 'खाता बनाएं' },
  newHere: { en: 'New here?', gu: 'નવા છો?', hi: 'नए हैं?' },
  haveAccount: { en: 'Already have an account?', gu: 'પહેલેથી એકાઉન્ટ છે?', hi: 'पहले से खाता है?' },
  forgot: { en: 'Forgot password? Contact your Bal Prakash head.', gu: 'પાસવર્ડ ભૂલી ગયા? તમારા બાળ પ્રકાશ સંચાલકનો સંપર્ક કરો.', hi: 'पासवर्ड भूल गए? अपने बाल प्रकाश प्रमुख से संपर्क करें।' },
  wait: { en: 'Please wait…', gu: 'થોડી રાહ જુઓ…', hi: 'कृपया प्रतीक्षा करें…' },
  badPhone: { en: 'Enter a valid 10-digit mobile number.', gu: '10 અંકનો સાચો મોબાઇલ નંબર લખો.', hi: '10 अंकों का सही मोबाइल नंबर लिखें।' },
  shortPassword: { en: 'Password must be at least 6 characters.', gu: 'પાસવર્ડ ઓછામાં ઓછા 6 અક્ષરનો હોવો જોઈએ.', hi: 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।' },
  wrongLogin: { en: 'Wrong mobile number or password.', gu: 'મોબાઇલ નંબર અથવા પાસવર્ડ ખોટો છે.', hi: 'मोबाइल नंबर या पासवर्ड गलत है।' },
  alreadyAccount: { en: 'This mobile number already has an account. Please sign in.', gu: 'આ નંબરનું એકાઉન્ટ પહેલેથી છે. કૃપા કરી સાઇન ઇન કરો.', hi: 'इस नंबर का खाता पहले से है। कृपया साइन इन करें।' },

  signOut: { en: 'Sign out', gu: 'સાઇન આઉટ', hi: 'साइन आउट' },
  teamHint: {
    en: 'Volunteers and heads: create an account with the mobile number the Main Head added for you.',
    gu: 'સ્વયંસેવકો અને સંચાલકો: મુખ્ય સંચાલકે ઉમેરેલા મોબાઇલ નંબરથી એકાઉન્ટ બનાવો.',
    hi: 'स्वयंसेवक और प्रमुख: मुख्य प्रमुख द्वारा जोड़े गए मोबाइल नंबर से खाता बनाएं।',
  },
} as const;

export type StringKey = keyof typeof STRINGS;

interface I18n {
  lang: UiLang;
  setLang: (l: UiLang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n | null>(null);

function readStoredLang(): UiLang {
  try {
    const v = localStorage.getItem('bp-lang');
    return v === 'gu' || v === 'hi' ? v : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(readStoredLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: UiLang) => {
    setLangState(l);
    try {
      localStorage.setItem('bp-lang', l);
    } catch {
      // storage may be blocked; the choice still applies for this visit
    }
  };

  const t = (key: StringKey, vars?: Record<string, string | number>) => {
    let s: string = STRINGS[key][lang];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const opts: { v: UiLang; label: string }[] = [
    { v: 'en', label: 'EN' },
    { v: 'gu', label: 'ગુ' },
    { v: 'hi', label: 'हि' },
  ];
  return (
    <div className={`inline-flex rounded-full border-2 border-white bg-white/80 p-1 shadow-pop ${className}`} role="group" aria-label="Language">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setLang(o.v)}
          aria-pressed={lang === o.v}
          className={`rounded-full px-3 py-1 text-sm font-extrabold transition ${
            lang === o.v ? 'bg-gradient-to-r from-saffron-500 to-bubble-500 text-white' : 'text-ink-500 hover:text-ink-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
