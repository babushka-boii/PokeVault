import { Button } from "./Button";
import "./ui.css";

/** Section-level error with its own retry; never blocks other sections. */
export function InlineError({ message, retryLabel, onRetry, calm = false }: { message: string; retryLabel: string; onRetry?: () => void; calm?: boolean }) {
  // `calm` is for a part of a page failing while the rest works: announced politely, not in alarm colours.
  return <div className={`pv-inline-error${calm ? " pv-inline-error--calm" : ""}`} role={calm ? "status" : "alert"}>
    <p>{message}</p>
    {onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
  </div>;
}
