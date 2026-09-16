import { describe, it, expect } from 'vitest';
import { formatPhone, isValidPhone, normalizePhone } from './customers';

describe('normalizePhone', () => {
  it('accepts a number the way people actually type it', () => {
    for (const typed of [
      '01099998888',
      '010 9999 8888',
      '010-9999-8888',
      ' 01099998888 ',
      '+201099998888',   // country code, local zero dropped
      '+2001099998888',  // country code, local zero kept
      '00201099998888',
      '0020 10 9999 8888',
      '201099998888',
    ]) {
      expect(normalizePhone(typed), `typed as "${typed}"`).toBe('01099998888');
    }
  });

  it('turns away anything that is not an Egyptian mobile', () => {
    for (const bad of ['', '12345', '0229998888', '0109999888', '010999988887', 'not a phone', null, undefined]) {
      expect(normalizePhone(bad), `"${bad}"`).toBeNull();
    }
  });

  it('accepts every Egyptian mobile prefix, at eleven digits', () => {
    for (const prefix of ['010', '011', '012', '015']) {
      expect(normalizePhone(`${prefix}1234567`), 'ten digits is too short').toBeNull();
      expect(normalizePhone(`${prefix} 1234 5678`)).toBe(`${prefix}12345678`);
    }
  });
});

describe('isValidPhone', () => {
  it('agrees with the normaliser', () => {
    expect(isValidPhone('010 9999 8888')).toBe(true);
    expect(isValidPhone('12345')).toBe(false);
  });
});

describe('formatPhone', () => {
  it('groups the digits for reading back', () => {
    expect(formatPhone('01099998888')).toBe('010 9999 8888');
    expect(formatPhone('+201099998888')).toBe('010 9999 8888');
  });

  it('leaves something it does not recognise alone', () => {
    expect(formatPhone('reception')).toBe('reception');
    expect(formatPhone(null)).toBe('');
  });
});
