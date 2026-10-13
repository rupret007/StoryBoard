import {
  APP_AUTH_SAVED_RECORDS_COPY,
  APP_AUTH_UNREACHABLE_TITLE
} from "@storyboard/shared";

export function ApiUnreachableCard() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--canvas)] px-6">
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-8 py-10 shadow-lg"
        data-testid="api-unreachable"
      >
        <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          {APP_AUTH_UNREACHABLE_TITLE}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {APP_AUTH_SAVED_RECORDS_COPY}
        </p>
        <form className="mt-6">
          <button type="submit" className="sb-btn-primary w-full">
            Try again
          </button>
        </form>
      </div>
    </div>
  );
}
