"use client";

import { APP_AUTH_SAVED_RECORDS_COPY } from "@storyboard/shared";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">StoryBoard could not load this page</h1>
      <p className="text-sm text-[var(--text-secondary)]">{APP_AUTH_SAVED_RECORDS_COPY}</p>
      <button type="button" onClick={reset} className="sb-btn-primary">
        Try loading again
      </button>
      <a href="/" className="text-sm underline">
        Return to your band
      </a>
    </main>
  );
}
