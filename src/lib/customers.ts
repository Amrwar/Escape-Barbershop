/**
 * Customer phone numbers, which double as their username.
 *
 * Egyptian mobiles are eleven digits starting 01. They get typed with spaces,
 * dashes, a +20 country code or a leading 0020, so everything is reduced to the
 * same eleven digits before it is stored or looked up.
 */

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0020")) digits = digits.slice(4);
  else if (digits.startsWith("20") && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return /^01\d{9}$/.test(digits) ? digits : null;
}

export function isValidPhone(input: string | null | undefined): boolean {
  return normalizePhone(input) !== null;
}

/** How a phone number is shown back to the customer: 010 1234 5678. */
export function formatPhone(input: string | null | undefined): string {
  const phone = normalizePhone(input);
  if (!phone) return input ?? "";
  return `${phone.slice(0, 3)} ${phone.slice(3, 7)} ${phone.slice(7)}`;
}
