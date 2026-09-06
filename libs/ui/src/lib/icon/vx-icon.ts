import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The Vexto icon set.
 *
 * Inline SVG rather than an icon font or a runtime library: icons inherit `currentColor`, cost
 * nothing at runtime, and cannot flash unstyled. The set is deliberately small — every icon here
 * is used by a screen, and an icon nobody uses is dead weight.
 *
 * All paths are drawn on a 24×24 grid with a 1.75 stroke and round joins, which is what makes them
 * look like one family.
 */
export type VxIconName =
  | 'dashboard'
  | 'trips'
  | 'routes'
  | 'live'
  | 'passengers'
  | 'drivers'
  | 'vehicle'
  | 'users'
  | 'agreements'
  | 'settings'
  | 'search'
  | 'bell'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'menu'
  | 'close'
  | 'plus'
  | 'more'
  | 'edit'
  | 'eye'
  | 'power'
  | 'check'
  | 'check-circle'
  | 'alert'
  | 'info'
  | 'map-pin'
  | 'clock'
  | 'calendar'
  | 'logout'
  | 'arrow-left'
  | 'filter'
  | 'refresh'
  | 'signal'
  | 'signal-off'
  | 'inbox'
  | 'trash'
  | 'grip'
  | 'phone'
  | 'mail'
  | 'shield'
  | 'user';

const PATHS: Readonly<Record<VxIconName, string>> = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  trips: 'M4 7h16M4 12h16M4 17h10M17 15l3 2-3 2',
  routes: 'M6 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM6 8v4a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4',
  live: 'M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11zM12 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  passengers:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M18 20a5 5 0 0 0-2-4',
  drivers: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0M9 20v-3M15 20v-3',
  vehicle:
    'M4 16V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 16h16M4 16v2h2v-2M18 16v2h2v-2M6 10h12M7.5 13h.5M16 13h.5',
  users: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 19a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M17.5 19a5.5 5.5 0 0 0-2-4',
  agreements: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6M10 9h2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 7.5 18l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 12.4H4a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 5.7 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10.5A1.6 1.6 0 0 0 11.6 2V2a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4H22a1.6 1.6 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.5 19a2 2 0 0 0 3 0',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  more: 'M12 6.5h.01M12 12h.01M12 17.5h.01',
  edit: 'M4 20h4l10-10a2.8 2.8 0 1 0-4-4L4 16v4zM13.5 6.5l4 4',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  power: 'M12 4v8M7.5 6.5a7 7 0 1 0 9 0',
  check: 'M5 13l4 4L19 7',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12.5l2.5 2.5 4.5-5',
  alert: 'M12 3l9 16H3l9-16zM12 10v4M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  'map-pin': 'M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  calendar: 'M4 7h16v13H4zM4 11h16M8 3v4M16 3v4',
  logout: 'M14 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8M17 8l4 4-4 4M21 12H9',
  'arrow-left': 'M20 12H4M10 6l-6 6 6 6',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5z',
  refresh: 'M20 11a8 8 0 1 0-.6 4M20 5v6h-6',
  signal: 'M12 20h.01M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 14 0M2 9.5a15 15 0 0 1 20 0',
  'signal-off': 'M12 20h.01M8.5 16.5a5 5 0 0 1 5.6-1M3 3l18 18M5 13a10 10 0 0 1 6-2.8',
  inbox: 'M4 13h4l2 3h4l2-3h4M5 5h14l1 8v6H4v-6l1-8z',
  trash: 'M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  phone: 'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
};

@Component({
  selector: 'vx-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.display]': "'inline-flex'", '[attr.aria-hidden]': 'true' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
})
export class VxIcon {
  readonly name = input.required<VxIconName>();
  readonly size = input(20);
  readonly strokeWidth = input(1.75);

  protected readonly path = computed(() => PATHS[this.name()]);
}
