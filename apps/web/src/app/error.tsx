"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
    <h1 className="text-xl font-semibold">StoryBoard could not load this page</h1>
    <p className="text-sm text-[var(--text-secondary)]">Check your connection, then try again. Saved band records are kept. If a save was interrupted, check the record before submitting it again.</p>
    <button type="button" onClick={reset} className="rounded bg-[var(--accent)] px-4 py-3 text-[#05080d]">Try loading again</button>
    <a href="/dashboard" className="text-sm underline">Return to your band</a>
  </main>;
}
