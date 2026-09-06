import type { VxIconName } from '@vexto/ui';

export interface NavItem {
  readonly label: string;
  readonly link: string;
  readonly icon: VxIconName;
  /** The user needs at least one of these to see the item. Empty means always visible. */
  readonly permissions?: readonly string[];
  /** Matches the link as a prefix, so a detail page keeps its parent highlighted. */
  readonly exact?: boolean;
}

export interface NavSection {
  /** Rendered above the group. Omitted for the first, unlabelled group. */
  readonly label?: string;
  readonly items: readonly NavItem[];
}
