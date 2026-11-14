import type * as React from "react";

/** The bare frame of /login and /enrol until phase 05 brings the dashboard's design. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-form">
        <p className="mb-6 font-mono text-mono text-muted-foreground">
          kit-deploy · deploy.fockus.dev
        </p>
        <div className="rounded-lg border border-border bg-card p-6">
          {children}
        </div>
      </div>
    </main>
  );
}
