"use client";

import { RefreshCw } from "lucide-react";
import { useFetchAll } from "@/components/providers/fetch-all-provider";
import { format } from "date-fns";
import clsx from "clsx";
import { useAuth } from "@/components/providers/auth-provider";

export function FetchAllButton() {
  const user = useAuth();
  const { fetching, fetchAll, lastFetchedAt } = useFetchAll();

  if (user?.role !== "ADMIN") return null;

  return (
    <div className="flex items-center gap-3">
      {lastFetchedAt ? (
        <span className="hidden text-xs text-muted sm:inline">
          Last fetch {format(lastFetchedAt, "HH:mm:ss")}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => fetchAll()}
        disabled={fetching}
        className={clsx(
          "inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition",
          "hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
        )}
      >
        <RefreshCw size={16} className={clsx(fetching && "animate-spin")} />
        {fetching ? "Fetching all platforms…" : "Fetch All Data"}
      </button>
    </div>
  );
}
