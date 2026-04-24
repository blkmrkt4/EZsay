"use client";

import Link from "next/link";

export default function EditError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold text-gray-900">
          Editor failed to load
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {error.message || "Something went wrong loading the editor."}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Back to documents
          </Link>
        </div>
      </div>
    </div>
  );
}
