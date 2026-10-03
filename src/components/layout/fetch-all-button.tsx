"use client";

import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { useFetchAll } from "@/components/providers/fetch-all-provider";
import { useAuth } from "@/components/providers/auth-provider";

export function FetchAllButton() {
  const user = useAuth();
  const { fetching, fetchAll, lastUpdatedAt } = useFetchAll();

  return (
    <div className="flex items-center gap-3">
      {/* Server-side time of the latest successful fetch: the same for every user. */}
      <span className="text-xs text-muted" title={lastUpdatedAt ? lastUpdatedAt.toLocaleString() : undefined}>
        {lastUpdatedAt ? `Data updated ${formatDistanceToNow(lastUpdatedAt, { addSuffix: true })}` : "No data fetched yet"}
      </span>
      {user?.role === "ADMIN" ? (
        <button
          type="button"
          onClick={() => void fetchAll()}
          disabled={fetching}
          className={clsx(
            "inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-on-accent shadow-sm transition",
            "hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <RefreshCw size={16} aria-hidden="true" className={clsx(fetching && "animate-spin")} />
          {fetching ? "Fetching all platforms…" : "Fetch All Data"}
        </button>
      ) : null}
    </div>
  );
}
