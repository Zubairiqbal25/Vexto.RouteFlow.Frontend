import { signal } from '@angular/core';
import type { VxListView } from '@vexto/ui';

/**
 * Remembers whether a list screen was last shown as cards or as a table.
 *
 * Per screen, not per app: somebody may well want passenger cards and a payments table, and forcing
 * one choice across the product would make the switch useless to exactly the people who need it.
 *
 * Cards are the default everywhere this is used. They are how an operator recognises a person or a
 * vehicle and acts on it, which is most of the day; the table is for comparing a column across
 * forty rows, which is a power-user and finance need.
 */
export function listViewPreference(screen: string): {
  readonly view: () => VxListView;
  readonly set: (view: VxListView) => void;
} {
  const key = `vexto.listView.${screen}`;
  const state = signal<VxListView>(read(key));

  return {
    view: state.asReadonly(),
    set: (view: VxListView) => {
      state.set(view);

      try {
        localStorage.setItem(key, view);
      } catch {
        // Private browsing, or storage blocked. The choice simply will not survive a reload.
      }
    },
  };
}

function read(key: string): VxListView {
  try {
    return localStorage.getItem(key) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
}
