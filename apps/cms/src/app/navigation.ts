import type { NavSection } from '@vexto/layouts';
import { VextoPermissions } from '@vexto/permissions';

/**
 * The CMS navigation: platform-owned administration and nothing else.
 *
 * Tenants and their administrators, platform content, platform settings. No routes, trips, drivers
 * or passengers — those are the operator portal's, and the CMS must not become a second operational
 * portal (AGENTS.md, "CMS is for platform-owned administration only"). Every item requires a
 * platform permission that no tenant role is granted and that a ServiceAdmin satisfies through the
 * single permission bypass; the sidebar therefore shows nothing at all to anybody who should not be
 * here, and the route guard sends them away.
 */
export const CMS_NAV: readonly NavSection[] = [
  {
    items: [
      {
        label: 'Dashboard',
        link: '/dashboard',
        icon: 'dashboard',
        exact: true,
        permissions: [VextoPermissions.Content.View],
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        label: 'Tenants',
        link: '/tenants',
        icon: 'building',
        permissions: [VextoPermissions.Tenants.View],
      },
      {
        label: 'Email Templates',
        link: '/email-templates',
        icon: 'mail',
        permissions: [VextoPermissions.Content.View],
      },
      {
        label: 'Report Templates',
        link: '/report-templates',
        icon: 'agreements',
        permissions: [VextoPermissions.Content.View],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'Email Layout',
        link: '/email-layout',
        icon: 'layout',
        permissions: [VextoPermissions.Content.Manage],
      },
      {
        label: 'Template Variables',
        link: '/variables',
        icon: 'code',
        permissions: [VextoPermissions.Content.View],
      },
    ],
  },
];
