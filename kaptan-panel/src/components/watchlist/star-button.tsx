"use client";

import { useState } from "react";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { Button } from "@/components/ui/button";

/**
 * Star or un-star a company ("İzlediklerim"). The page keeps what the server said last: it answers with the
 * whole list, so the star never drifts from the truth (a full list says so, in words).
 */
export function StarButton({ ticker, watched, onChanged }: { ticker: string; watched: boolean; onChanged: (watched: boolean) => void }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await (watched ? api.unwatch(ticker) : api.watch(ticker));
      onChanged(list.some((w) => w.ticker === ticker));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant={watched ? "secondary" : "primary"} onClick={toggle} pending={busy} aria-pressed={watched}>
        <span aria-hidden>{watched ? "★" : "☆"}</span> {watched ? "İzliyorsun" : "İzlemeye al"}
      </Button>
      {error ? (
        <p role="alert" className="text-dense text-loss">
          {error}
        </p>
      ) : null}
    </>
  );
}
