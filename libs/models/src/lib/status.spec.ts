import { describe, expect, it } from 'vitest';
import { isTripClosed, statusLabel, statusTone } from './status';

describe('statusTone', () => {
  it('shares one tone across modules for the same word', () => {
    // A suspended driver and a suspended vehicle must not be different colours.
    expect(statusTone('Suspended')).toBe('danger');
    expect(statusTone('Active')).toBe('success');
  });

  it('falls back to neutral for a status the frontend has not seen', () => {
    expect(statusTone('SomethingNewOnTheBackend')).toBe('neutral');
    expect(statusTone(null)).toBe('neutral');
  });
});

describe('statusLabel', () => {
  it('uses the friendlier label where one exists', () => {
    expect(statusLabel('PendingInvitation')).toBe('Invited');
    expect(statusLabel('NoShow')).toBe('No show');
  });

  it('humanises anything else rather than showing the raw enum name', () => {
    expect(statusLabel('InProgress')).toBe('In Progress');
  });
});

describe('isTripClosed', () => {
  it('covers both terminal states, so attendance controls disappear in each', () => {
    expect(isTripClosed('Completed')).toBe(true);
    expect(isTripClosed('Cancelled')).toBe(true);
    expect(isTripClosed('Started')).toBe(false);
  });
});
