import { describe, expect, it } from 'vitest';
import { VextoPermissions } from '@vexto/permissions';
import { dashboardFocus } from './dashboard-focus';

/**
 * The one place in the product that decides what a given account sees first.
 *
 * Worth testing directly because the rule is easy to get subtly wrong in a way no screen makes
 * obvious: an owner who also holds billing permissions would silently be treated as a finance clerk
 * and shown money above their operation, and nothing would look broken.
 */
function holder(...granted: string[]) {
  const set = new Set(granted);

  return (permission: string) => set.has(permission);
}

describe('dashboardFocus', () => {
  it('sends platform staff to the platform, since they hold no tenant', () => {
    expect(dashboardFocus(() => true, true, false)).toBe('platform');
  });

  it('treats a ServiceAdmin inside a tenant context as an owner of it', () => {
    // In support context they do hold a tenant, and the tenant screens are the useful ones.
    expect(dashboardFocus(() => true, true, true)).toBe('owner');
  });

  it('recognises an owner by the levers nobody else holds', () => {
    const owner = holder(VextoPermissions.Settings.Manage, VextoPermissions.Trips.Manage);

    expect(dashboardFocus(owner, false, true)).toBe('owner');
  });

  it('does not mistake an owner who can also bill for a finance clerk', () => {
    // The ordering trap: someone with billing *and* the operation is the owner, not the accountant.
    const owner = holder(
      VextoPermissions.Users.Manage,
      VextoPermissions.Billing.View,
      VextoPermissions.Trips.Manage,
    );

    expect(dashboardFocus(owner, false, true)).toBe('owner');
  });

  it('recognises a dispatcher by what they run rather than by a role name', () => {
    const dispatcher = holder(VextoPermissions.Trips.Manage, VextoPermissions.Tracking.View);

    expect(dashboardFocus(dispatcher, false, true)).toBe('dispatch');
  });

  it('recognises a finance account with no operational permissions', () => {
    const finance = holder(VextoPermissions.Billing.View, VextoPermissions.Payments.View);

    expect(dashboardFocus(finance, false, true)).toBe('finance');
  });

  it('falls back to the operational layout rather than to nothing', () => {
    // A read-only account holds none of the deciding permissions. It still gets a sensible screen;
    // the panels it cannot see are dropped by the page regardless of the order chosen here.
    expect(dashboardFocus(holder(VextoPermissions.Trips.View), false, true)).toBe('dispatch');
  });
});
