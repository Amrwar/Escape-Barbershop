import { describe, it, expect } from 'vitest';
import { isPublicCustomerPath, isCustomerPath, isStaffRole } from './roles';

describe('isStaffRole', () => {
  it('lets staff in and keeps customers out', () => {
    expect(isStaffRole('OWNER')).toBe(true);
    expect(isStaffRole('CASHIER')).toBe(true);
    expect(isStaffRole('CUSTOMER')).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe('isCustomerPath', () => {
  it('claims the customer app', () => {
    expect(isCustomerPath('/app')).toBe(true);
    expect(isCustomerPath('/app/book')).toBe(true);
  });

  it('does not claim a shop screen whose name merely starts with "app"', () => {
    expect(isCustomerPath('/appointments')).toBe(false);
    expect(isCustomerPath('/appointments/new')).toBe(false);
  });
});

describe('isPublicCustomerPath', () => {
  it('lets anybody sign in', () => {
    expect(isPublicCustomerPath('/app/login')).toBe(true);
  });

  it('lets anybody read what the shop charges and who is in', () => {
    // The questions people ask before deciding to come, so an account cannot
    // be the price of asking them.
    expect(isPublicCustomerPath('/app/prices')).toBe(true);
    expect(isPublicCustomerPath('/app/roster')).toBe(true);
  });

  it('keeps everything about a customer behind the login', () => {
    expect(isPublicCustomerPath('/app')).toBe(false);
    expect(isPublicCustomerPath('/app/book')).toBe(false);
    expect(isPublicCustomerPath('/app/profile')).toBe(false);
    expect(isPublicCustomerPath('/app/history')).toBe(false);
    expect(isPublicCustomerPath('/app/appointments')).toBe(false);
  });

  it('matches whole segments, so a lookalike path is not let through', () => {
    expect(isPublicCustomerPath('/app/loginate')).toBe(false);
    expect(isPublicCustomerPath('/app/prices-secret')).toBe(false);
    expect(isPublicCustomerPath('/app/rosterful')).toBe(false);
  });
});
