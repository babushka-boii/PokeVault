import type { BinderSummary } from "../../services/binders";

/** The binder with the latest placement (D7), or the first by order when none has any. */
export function mostRecent(binders: BinderSummary[]): BinderSummary | undefined {
  return binders.reduce<BinderSummary | undefined>((best, binder) => {
    if (!best) return binder;
    if (!binder.last_placed_at) return best;
    return !best.last_placed_at || Date.parse(binder.last_placed_at) > Date.parse(best.last_placed_at) ? binder : best;
  }, undefined);
}
