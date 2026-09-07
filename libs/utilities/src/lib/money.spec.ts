import { describe, expect, it } from 'vitest';
import { formatMoney } from './formatting';

/**
 * How money reads on every billing screen. Small, and worth pinning: the difference between a dash
 * and a zero is a passenger being told they owe nothing when in fact nobody knows yet.
 */
describe('formatMoney', () => {
  it('shows the currency code and two decimals', () => {
    expect(formatMoney(420, 'AED')).toBe('AED 420.00');
    expect(formatMoney(420.5, 'AED')).toBe('AED 420.50');
  });

  it('keeps the second decimal on a whole number', () => {
    // 420 and 420.00 are the same amount and read differently on an invoice.
    expect(formatMoney(1000, 'USD')).toBe('USD 1,000.00');
  });

  /**
   * A provider fee that has not been reported yet is unknown, not zero. Showing 0.00 would tell an
   * operator their processing cost was nothing.
   */
  it('shows a dash when the amount is unknown', () => {
    expect(formatMoney(null, 'AED')).toBe('—');
    expect(formatMoney(undefined, 'AED')).toBe('—');
  });

  it('omits the code when there is no currency', () => {
    expect(formatMoney(12.3, null)).toBe('12.30');
  });

  it('formats zero as zero rather than as unknown', () => {
    expect(formatMoney(0, 'AED')).toBe('AED 0.00');
  });
});
