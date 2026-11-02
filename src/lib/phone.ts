// Phone + password login has no SMS cost: each phone maps to a private placeholder
// email inside Supabase Auth. "Confirm email" must be turned off in Supabase.
const PHONE_EMAIL_DOMAIN = 'phone.balprakash.app';

export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '').slice(-10);
}

export function isValidPhone(input: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(input));
}

export function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@${PHONE_EMAIL_DOMAIN}`;
}
