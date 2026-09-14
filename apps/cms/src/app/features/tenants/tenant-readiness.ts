import type { TenantAdministrator, TenantResponse, TenantSubscription } from '@vexto/models';

/** One thing that is, or is not yet, done for an operator. */
export interface ReadinessStep {
  readonly id: 'business' | 'contact' | 'settings' | 'plan' | 'admin';
  readonly label: string;
  readonly done: boolean;
  /** What is missing, when the step is not done. */
  readonly hint: string;
}

export interface TenantReadiness {
  readonly steps: readonly ReadinessStep[];
  readonly percent: number;
  readonly complete: boolean;
}

/**
 * Whether an operator has everything it needs to start, as named steps rather than a score.
 *
 * A UI read-model, computed on the client from three things the detail screen already fetches:
 * the tenant, its subscription and its administrators. Nothing is persisted and there is no
 * workflow engine behind it — each step is a plain boolean over a fact the platform already holds,
 * so it can never disagree with the records it summarises (docs/tenant-onboarding.md).
 *
 * The percentage is the fraction of steps done and exists only so a card can say "Setup 80%";
 * the steps are the answer, the number is the glance.
 */
export function tenantReadiness(
  tenant: TenantResponse,
  subscription: TenantSubscription | null,
  administrators: readonly TenantAdministrator[] | null,
): TenantReadiness {
  const details = tenant.businessDetails;
  const hasPlan =
    subscription !== null &&
    subscription.planCode !== null &&
    subscription.planCode !== undefined &&
    subscription.status !== 'None';

  const activeAdmin = (administrators ?? []).some((admin) => admin.accountStatus === 'Active' && admin.membershipStatus === 'Active');
  const pendingAdmin = (administrators ?? []).some((admin) => admin.invitationStatus === 'Pending');

  const steps: ReadinessStep[] = [
    {
      id: 'business',
      label: 'Business details',
      done: Boolean(tenant.legalName && tenant.tradeLicenseNumber && tenant.tradeLicenseExpiryDate),
      hint: tenant.tradeLicenseExpiryDate ? '' : 'Add the trade licence expiry date.',
    },
    {
      id: 'contact',
      label: 'Contact & address',
      done: Boolean(details.primaryContactName && details.emirate),
      hint: details.primaryContactName ? 'Add the emirate.' : 'Add a primary contact.',
    },
    {
      id: 'settings',
      label: 'Settings',
      // Every tenant gets a settings row on creation; the step exists so the summary reads as the
      // wizard did, and so a future required setting has somewhere to report.
      done: true,
      hint: '',
    },
    {
      id: 'plan',
      label: 'Plan',
      done: hasPlan,
      hint: 'Assign a Vexto plan.',
    },
    {
      id: 'admin',
      label: 'Tenant administrator',
      done: activeAdmin,
      hint: pendingAdmin ? 'Invitation pending — not accepted yet.' : 'Invite a tenant administrator.',
    },
  ];

  const done = steps.filter((step) => step.done).length;

  return {
    steps,
    percent: Math.round((done / steps.length) * 100),
    complete: done === steps.length,
  };
}

/** The wording under "Admin" on a tenant card, from the membership counts the list already carries. */
export function administratorSummary(tenant: TenantResponse): { label: string; tone: 'success' | 'warning' | 'neutral' } {
  const members = tenant.members;

  if (!members || (members.active === 0 && members.invited === 0 && members.suspended === 0)) {
    return { label: 'None yet', tone: 'neutral' };
  }

  if (members.active > 0) {
    return { label: 'Active', tone: 'success' };
  }

  if (members.invited > 0) {
    return { label: 'Invitation pending', tone: 'warning' };
  }

  return { label: 'Suspended', tone: 'warning' };
}
