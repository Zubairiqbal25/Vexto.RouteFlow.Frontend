import { beforeEach, describe, expect, it } from 'vitest';
import { listViewPreference } from './list-view';

describe('listViewPreference', () => {
  beforeEach(() => localStorage.clear());

  it('starts on cards', () => {
    // Cards are how an operator recognises a person and acts on it, which is most of the day. The
    // table is for comparing a column across forty rows, which is the narrower need.
    expect(listViewPreference('passengers').view()).toBe('cards');
  });

  it('remembers a switch to the table', () => {
    listViewPreference('passengers').set('table');

    expect(listViewPreference('passengers').view()).toBe('table');
  });

  it('keeps a separate choice per screen', () => {
    listViewPreference('payments').set('table');

    // Somebody may well want passenger cards and a payments table; one global setting would make
    // the switch useless to exactly the people who need it.
    expect(listViewPreference('passengers').view()).toBe('cards');
    expect(listViewPreference('payments').view()).toBe('table');
  });

  it('falls back to cards when the stored value is nonsense', () => {
    localStorage.setItem('vexto.listView.passengers', 'carousel');

    expect(listViewPreference('passengers').view()).toBe('cards');
  });

  it('updates the signal immediately, without waiting for storage', () => {
    const preference = listViewPreference('drivers');

    preference.set('table');

    expect(preference.view()).toBe('table');
  });
});
