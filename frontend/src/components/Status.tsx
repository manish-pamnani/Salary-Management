import { ApiError } from "../api";
import { formatDate } from "../format";

/**
 * Every place that shows money says which day it is "current" on. The date
 * comes from the response that produced the numbers, not from the browser.
 */
export function AsOf({ date }: { date: string }) {
  return (
    <span className="asof-tag" title="Current salary = the latest record effective on or before this date">
      as of {formatDate(date)}
    </span>
  );
}

export function Loading({ slow, label = "Loading…" }: { slow: boolean; label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" /> {label}
      {slow && (
        <p className="muted">
          Still waiting. The demo runs on a free server that sleeps when idle and takes about 17 seconds to wake
          up.
        </p>
      )}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const isNotFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="error" role="alert">
      <p>{isNotFound ? "Not found." : error.message}</p>
      {onRetry && !isNotFound && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
