import {
  Directive,
  type EmbeddedViewRef,
  Input,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { PermissionService } from './permission.service';

/**
 * Shows content only when the user holds at least one of the given permissions.
 *
 *   <button *vxCan="'Passengers.Manage'">Add Passenger</button>
 *   <a *vxCan="['Trips.View', 'Tracking.View']">Live Fleet</a>
 *
 * Hiding an action is a courtesy, not a security control — the API is the authority.
 */
@Directive({ selector: '[vxCan]' })
export class CanDirective {
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private readonly permissions = inject(PermissionService);

  private readonly required = signal<string[]>([]);
  private view: EmbeddedViewRef<unknown> | null = null;

  @Input({ required: true })
  set vxCan(value: string | string[]) {
    this.required.set(Array.isArray(value) ? value : [value]);
  }

  constructor() {
    effect(() => {
      const allowed = this.permissions.hasAny(...this.required());

      if (allowed && !this.view) {
        this.view = this.container.createEmbeddedView(this.template);
      } else if (!allowed && this.view) {
        this.container.clear();
        this.view = null;
      }
    });
  }
}
