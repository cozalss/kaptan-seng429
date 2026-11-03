"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderTicket } from "@/lib/domain";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { useNow } from "@/lib/clock";
import type { HoldAck } from "@/lib/solo/activity";
import type { Suggestion } from "@/lib/solo/overview";
import { approvedSentence, skippedSentence } from "@/lib/solo/words";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { AFTER_APPROVAL, slipsToEnter } from "@/components/tickets/ticket-logic";
import { bringToFront, EMPTY_DECIDE, failAnswer, pressAnswer, settleAnswer, type Answer, type DecideState, type Flight } from "./decide-logic";

/** The note a "Geç" leaves on the proposal (the backend may ask for a reason on a rejection). */
const SKIP_COMMENT = "Ana sayfadan geçildi.";
/** While an approved order's details have not arrived, ask again this often. */
const TICKET_RETRY_MS = 2_500;

export interface Decisions {
  state: DecideState;
  /** Orders waiting to be entered at the bank, oldest first, plus those answered in this visit. */
  steps: readonly OrderTicket[];
  /** The ticket of an answered suggestion, once it is here. */
  ticketOf: (id: string) => OrderTicket | null;
  ticketsError: string | null;
  retryTickets: () => void;
  onMarked: (t: OrderTicket) => void;
  onAnswer: (s: Suggestion, answer: Answer) => void;
  onPick: (id: string) => void;
  /** The latest thing to read out (a polite live region says it). */
  announcement: string;
}

/**
 * Answers on the home. Visuals first: the object is sealed or gone in the same frame as the press,
 * then the server is asked; if it refuses, the object comes back with the reason. Several answers
 * can be in the air at once, so a slow network never holds up the next decision.
 */
export function useDecisions({ refresh, addHold }: { refresh: () => unknown; addHold: (h: HoldAck) => void }): Decisions {
  const api = useApi();
  const now = useNow(30_000);
  const [state, setState] = useState<DecideState>(EMPTY_DECIDE);
  const [markedHere, setMarkedHere] = useState<readonly string[]>([]);
  const tickets = useApiQuery((a) => a.listTickets(), []);
  const refetchTickets = tickets.refetch;

  useEventStream("desk", {
    ticket: () => void refetchTickets(),
  });

  const list = tickets.data;
  const ticketOf = useCallback((id: string) => list?.find((t) => t.proposal_id === id) ?? null, [list]);
  const approvedHere = state.flights.filter((f) => f.answer === "approve" && f.action !== "tut");
  const missing = approvedHere.some((f) => f.phase === "done" && !ticketOf(f.id));

  useEffect(() => {
    if (!missing) return;
    const timer = setInterval(() => void refetchTickets(), TICKET_RETRY_MS);
    return () => clearInterval(timer);
  }, [missing, refetchTickets]);

  const last = state.flights.at(-1);
  const announcement = last?.phase === "done" ? answerSaid(last, ticketOf(last.id)) : "";

  const steps = useMemo(() => {
    const here = new Set(state.flights.map((f) => f.id));
    const waiting = new Set(slipsToEnter(list, now).map((t) => t.ticket_no));
    return (list ?? [])
      .filter((t) => waiting.has(t.ticket_no) || markedHere.includes(t.ticket_no) || here.has(t.proposal_id))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }, [list, now, markedHere, state.flights]);

  const send = async (s: Suggestion, answer: Answer) => {
    if (s.action === "tut") {
      const done = await api.holdSuggestion(s.id, { kind: answer === "approve" ? "held" : "skipped" });
      addHold({ id: s.id, symbol: s.symbol, at: done.at, answer: done.kind });
      return;
    }
    await api.decideApproval(s.id, { decision: answer === "approve" ? "approve" : "reject", approved_notional_try: null, comment: answer === "skip" ? SKIP_COMMENT : "" });
  };

  const onAnswer = async (s: Suggestion, answer: Answer) => {
    setState((prev) => pressAnswer(prev, s, answer));
    try {
      await send(s, answer);
      setState((prev) => settleAnswer(prev, s.id));
      void refetchTickets();
      void refresh();
    } catch (e) {
      const message = errorMessage(e);
      setState((prev) => failAnswer(prev, s.id, message));
    }
  };

  return {
    state,
    steps,
    ticketOf,
    ticketsError: tickets.error,
    retryTickets: () => void refetchTickets(),
    onMarked: (t) => {
      setMarkedHere((prev) => [...prev, t.ticket_no]);
      void refetchTickets();
      void refresh();
    },
    onAnswer: (s, answer) => void onAnswer(s, answer),
    onPick: (id) => setState((prev) => bringToFront(prev, id)),
    announcement,
  };
}

/** The server said yes: what the person hears. Never before it did. */
function answerSaid(f: Flight, ticket: OrderTicket | null): string {
  if (f.answer === "skip") return skippedSentence(f.symbol);
  if (f.action === "tut") return `${approvedSentence("tut", f.symbol)} Yapman gereken bir şey yok.`;
  return ticket ? AFTER_APPROVAL.announce : `${approvedSentence(f.action, f.symbol)} İşlem henüz yapılmadı; bilgiler hazırlanıyor.`;
}
