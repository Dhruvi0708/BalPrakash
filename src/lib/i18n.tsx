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
  registerCta: { en: 'New to Bal Prakash? Register here', gu: 'બાળ પ્રકાશમાં નવા છો? અહીં નોંધણી કરો', hi: 'बाल प्रकाश में नए हैं? यहां पंजीकरण करें' },
  wait: { en: 'Please wait…', gu: 'થોડી રાહ જુઓ…', hi: 'कृपया प्रतीक्षा करें…' },
  badPhone: { en: 'Enter a valid 10-digit mobile number.', gu: '10 અંકનો સાચો મોબાઇલ નંબર લખો.', hi: '10 अंकों का सही मोबाइल नंबर लिखें।' },
  shortPassword: { en: 'Password must be at least 6 characters.', gu: 'પાસવર્ડ ઓછામાં ઓછા 6 અક્ષરનો હોવો જોઈએ.', hi: 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।' },
  wrongLogin: { en: 'Wrong mobile number or password.', gu: 'મોબાઇલ નંબર અથવા પાસવર્ડ ખોટો છે.', hi: 'मोबाइल नंबर या पासवर्ड गलत है।' },
  alreadyAccount: { en: 'This mobile number already has an account. Please sign in.', gu: 'આ નંબરનું એકાઉન્ટ પહેલેથી છે. કૃપા કરી સાઇન ઇન કરો.', hi: 'इस नंबर का खाता पहले से है। कृपया साइन इन करें।' },

  regTitle: { en: 'Bal Prakash registration', gu: 'બાળ પ્રકાશ નોંધણી', hi: 'बाल प्रकाश पंजीकरण' },
  regSub: { en: 'Gujarati every month · English every 2 months', gu: 'ગુજરાતી દર મહિને · અંગ્રેજી દર 2 મહિને', hi: 'गुजराती हर महीने · अंग्रेज़ी हर 2 महीने' },
  regClosed: { en: 'Registration is closed right now', gu: 'હાલ નોંધણી બંધ છે', hi: 'अभी पंजीकरण बंद है' },
  regOpensOn: { en: 'opens on', gu: 'શરૂ થશે', hi: 'शुरू होगा' },
  regCheckLater: { en: 'Please check again later or contact your Bal Prakash head.', gu: 'પછી ફરી જુઓ અથવા બાળ પ્રકાશ સંચાલકનો સંપર્ક કરો.', hi: 'बाद में फिर देखें या बाल प्रकाश प्रमुख से संपर्क करें।' },
  openUntil: { en: 'open until', gu: 'સુધી ખુલ્લું', hi: 'तक खुला' },
  childName: { en: 'Name of balak / balika', gu: 'બાળક / બાલિકાનું નામ', hi: 'बालक / बालिका का नाम' },
  balakOrBalika: { en: 'Balak or Balika', gu: 'બાળક કે બાલિકા', hi: 'बालक या बालिका' },
  balak: { en: 'Balak', gu: 'બાળક', hi: 'बालक' },
  balika: { en: 'Balika', gu: 'બાલિકા', hi: 'बालिका' },
  language: { en: 'Language', gu: 'ભાષા', hi: 'भाषा' },
  gujaratiMonthly: { en: 'Gujarati (every month)', gu: 'ગુજરાતી (દર મહિને)', hi: 'गुजराती (हर महीने)' },
  englishBimonthly: { en: 'English (every 2 months)', gu: 'અંગ્રેજી (દર 2 મહિને)', hi: 'अंग्रेज़ी (हर 2 महीने)' },
  plan: { en: 'Plan', gu: 'યોજના', hi: 'योजना' },
  oneYear: { en: '1 year', gu: '1 વર્ષ', hi: '1 वर्ष' },
  threeYears: { en: '3 years', gu: '3 વર્ષ', hi: '3 वर्ष' },
  area: { en: 'Area', gu: 'વિસ્તાર', hi: 'क्षेत्र' },
  selectArea: { en: 'Select area', gu: 'વિસ્તાર પસંદ કરો', hi: 'क्षेत्र चुनें' },
  dob: { en: 'Date of birth', gu: 'જન્મ તારીખ', hi: 'जन्म तिथि' },
  address: { en: 'Address', gu: 'સરનામું', hi: 'पता' },
  paidBy: { en: 'Paid by', gu: 'ચુકવણી', hi: 'भुगतान' },
  receipt: { en: 'UPI ref / receipt no.', gu: 'UPI રેફ / રસીદ નં.', hi: 'UPI रेफ / रसीद नं.' },
  amount: { en: 'Amount (₹)', gu: 'રકમ (₹)', hi: 'राशि (₹)' },
  select: { en: 'Select', gu: 'પસંદ કરો', hi: 'चुनें' },
  submitReg: { en: 'Submit registration', gu: 'નોંધણી મોકલો', hi: 'पंजीकरण भेजें' },
  submitting: { en: 'Submitting…', gu: 'મોકલી રહ્યા છીએ…', hi: 'भेज रहे हैं…' },
  regDone: { en: 'Yay! Registration received for', gu: 'વાહ! નોંધણી મળી ગઈ:', hi: 'वाह! पंजीकरण मिल गया:' },
  regDoneHint: {
    en: 'Your head will check the payment and confirm it. To follow your books, create an account with mobile number',
    gu: 'સંચાલક ચુકવણી તપાસીને પુષ્ટિ કરશે. તમારા પુસ્તકો જોવા આ મોબાઇલ નંબરથી એકાઉન્ટ બનાવો:',
    hi: 'प्रमुख भुगतान जांच कर पुष्टि करेंगे। अपनी किताबें देखने के लिए इस मोबाइल नंबर से खाता बनाएं:',
  },
  registerAnother: { en: 'Register another person', gu: 'બીજી વ્યક્તિની નોંધણી', hi: 'दूसरे व्यक्ति का पंजीकरण' },
  signInCreate: { en: 'Sign in / create account', gu: 'સાઇન ઇન / એકાઉન્ટ બનાવો', hi: 'साइन इन / खाता बनाएं' },
  alreadyRegistered: { en: 'Already registered?', gu: 'નોંધણી થઈ ગઈ છે?', hi: 'पंजीकरण हो चुका है?' },
  seeBooks: { en: 'Sign in to see your books', gu: 'પુસ્તકો જોવા સાઇન ઇન કરો', hi: 'किताबें देखने के लिए साइन इन करें' },

  myBooks: { en: 'My books', gu: 'મારાં પુસ્તકો', hi: 'मेरी किताबें' },
  myBooksSub: { en: 'Registered with', gu: 'નોંધાયેલ નંબર', hi: 'पंजीकृत नंबर' },
  noRegistration: { en: 'No registration found for this number yet.', gu: 'આ નંબર માટે હજુ નોંધણી મળી નથી.', hi: 'इस नंबर के लिए अभी कोई पंजीकरण नहीं मिला।' },
  contactHead: { en: 'Please contact your Bal Prakash head, or register when registration opens.', gu: 'બાળ પ્રકાશ સંચાલકનો સંપર્ક કરો અથવા નોંધણી ખુલે ત્યારે નોંધણી કરો.', hi: 'बाल प्रकाश प्रमुख से संपर्क करें या पंजीकरण खुलने पर पंजीकरण करें।' },
  signInWithMobile: { en: 'To see your books, sign out and sign in with the mobile number you registered with.', gu: 'પુસ્તકો જોવા, સાઇન આઉટ કરી નોંધાયેલ મોબાઇલ નંબરથી સાઇન ઇન કરો.', hi: 'किताबें देखने के लिए साइन आउट करें और पंजीकृत मोबाइल नंबर से साइन इन करें।' },
  collected: { en: 'Collected', gu: 'મળી ગયાં', hi: 'मिल गईं' },
  readyToCollect: { en: 'Ready to collect', gu: 'લેવા માટે તૈયાર', hi: 'लेने के लिए तैयार' },
  stillToCome: { en: 'Still to come', gu: 'હજુ આવવાનાં', hi: 'अभी आनी हैं' },
  collectedByYou: { en: 'Collected by you', gu: 'તમે લીધું', hi: 'आपने लिया' },
  collectedBy: { en: 'Collected by', gu: 'લેનાર', hi: 'लेने वाले' },
  yearPlan: { en: 'year plan', gu: 'વર્ષની યોજના', hi: 'वर्ष की योजना' },
  noSubscription: { en: 'No subscription yet.', gu: 'હજુ લવાજમ નથી.', hi: 'अभी कोई सदस्यता नहीं।' },
  myCard: { en: 'My card', gu: 'મારું કાર્ડ', hi: 'मेरा कार्ड' },
  cardHint: { en: 'Show this QR code when you collect your book.', gu: 'પુસ્તક લેતી વખતે આ QR કોડ બતાવો.', hi: 'किताब लेते समय यह QR कोड दिखाएं।' },
  needHelp: { en: "Didn't get a book?", gu: 'પુસ્તક ન મળ્યું?', hi: 'किताब नहीं मिली?' },
  helpPlaceholder: { en: 'Tell us what happened…', gu: 'શું થયું તે જણાવો…', hi: 'बताइए क्या हुआ…' },
  send: { en: 'Send', gu: 'મોકલો', hi: 'भेजें' },
  helpSent: { en: 'Sent! Your head will reply here.', gu: 'મોકલ્યું! સંચાલક અહીં જવાબ આપશે.', hi: 'भेज दिया! प्रमुख यहां जवाब देंगे।' },
  reply: { en: 'Reply', gu: 'જવાબ', hi: 'जवाब' },
  expiringSoon: { en: 'Only {n} left — renew soon!', gu: 'ફક્ત {n} બાકી — જલદી નવીકરણ કરો!', hi: 'सिर्फ {n} बाकी — जल्दी नवीनीकरण करें!' },
  signOut: { en: 'Sign out', gu: 'સાઇન આઉટ', hi: 'साइन आउट' },
  issue: { en: 'Issue', gu: 'અંક', hi: 'अंक' },
  statusActive: { en: 'active', gu: 'ચાલુ', hi: 'सक्रिय' },
  statusPending: { en: 'waiting for approval', gu: 'મંજૂરી બાકી', hi: 'मंजूरी बाकी' },
  statusExpired: { en: 'completed', gu: 'પૂર્ણ', hi: 'पूर्ण' },
  statusCancelled: { en: 'cancelled', gu: 'રદ', hi: 'रद्द' },
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
