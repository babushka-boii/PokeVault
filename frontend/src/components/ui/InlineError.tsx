import { Button } from "./Button";
import "./ui.css";

/** Section-level error with its own retry; never blocks other sections. */
export function InlineError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry?: () => void }) {
  return <div className="pv-inline-error" role="alert">
    <p>{message}</p>
    {onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
  </div>;
}
