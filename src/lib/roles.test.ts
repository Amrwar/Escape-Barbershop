import { describe, it, expect } from 'vitest';
import { isCustomerLoginPath, isCustomerPath, isStaffRole } from './roles';

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

describe('isCustomerLoginPath', () => {
  it('is only the customer sign-in page', () => {
    expect(isCustomerLoginPath('/app/login')).toBe(true);
    expect(isCustomerLoginPath('/app/loginate')).toBe(false);
    expect(isCustomerLoginPath('/app/book')).toBe(false);
  });
});
