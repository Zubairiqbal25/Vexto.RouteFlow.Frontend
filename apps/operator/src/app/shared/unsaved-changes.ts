import { inject } from '@angular/core';
import type { AbstractControl } from '@angular/forms';
import { ConfirmService } from '@vexto/ui';

/**
 * Guards a form against being closed with work in it.
 *
 * **Deliberately keyed on `dirty`, not on a value comparison.** Angular sets `dirty` when a person
 * changes a control, and that is exactly the thing worth protecting: a field the user typed into and
 * then edited back to its original value still represents attention they spent, and a diff-based
 * check would throw it away silently. A form nobody touched closes instantly, which is the common
 * case and must stay frictionless.
 *
 * Returns true when it is safe to close. The caller decides what closing means — a drawer, a modal,
 * a navigation — so this stays usable everywhere without knowing about any of them.
 *
 * **Not applied to every form.** A two-field drawer does not warrant a dialog asking whether you
 * meant it; interrupting somebody to protect one line of typing is worse than losing the line.
 * Reserve it for forms with enough in them that redoing the work is a real cost.
 */
export function unsavedChangesGuard() {
  const confirm = inject(ConfirmService);

  return async (form: Pick<AbstractControl, 'dirty'>): Promise<boolean> => {
    if (!form.dirty) {
      return true;
    }

    return confirm.ask({
      title: 'You have unsaved changes',
      message: 'If you close now, what you have entered will be lost.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      danger: true,
    });
  };
}
