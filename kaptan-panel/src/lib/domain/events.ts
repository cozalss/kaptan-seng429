import { z } from "zod";
import { Confidence, EventType, IsoDateTime } from "./common";
import { DayCounters, DisclosureListItem } from "./disclosure";
import { LimitVersion } from "./governance";
import { NodeName, RunOutcome, RunStatus } from "./run";
import { ApprovalCard, Fill, Order, OrderTicket, RiskStatus } from "./trading";
import { CrewActivity, CrewAgent } from "./crew";

/**
 * SSE streams (04 §11). Each event is { stream, event, id, data }.
 * `counters` on /stream/feed is a panel addition (FRONTEND-SPEC §9 Ç-12).
 */
export const StreamName = z.enum(["feed", "desk", "run"]);
export type StreamName = z.infer<typeof StreamName>;

export const FeedEvent = z.discriminatedUnion("event", [
  z.object({ event: z.literal("disclosure"), data: DisclosureListItem }),
  z.object({
    event: z.literal("classification"),
    data: z.object({ disclosure_index: z.number().int(), event_type: EventType, confidence: Confidence }),
  }),
  z.object({
    event: z.literal("news_linked"),
    data: z.object({ disclosure_index: z.number().int(), count: z.number().int() }),
  }),
  z.object({ event: z.literal("counters"), data: DayCounters }),
]);
export type FeedEvent = z.infer<typeof FeedEvent>;

export const DeskEvent = z.discriminatedUnion("event", [
  z.object({ event: z.literal("approval.requested"), data: ApprovalCard }),
  z.object({ event: z.literal("approval.decided"), data: ApprovalCard }),
  z.object({ event: z.literal("order"), data: Order }),
  z.object({ event: z.literal("fill"), data: Fill.extend({ ticker: z.string() }) }),
  z.object({ event: z.literal("kill_switch"), data: RiskStatus }),
  z.object({ event: z.literal("halt"), data: RiskStatus }),
  z.object({ event: z.literal("limits.changed"), data: LimitVersion }),
  /** A ticket was created (after your approval) or marked (girildi / dolmadı / iptal / süresi doldu). */
  z.object({ event: z.literal("ticket"), data: OrderTicket }),
  /** A crew member changed what it is doing (Köprü and Tayfa live state). */
  z.object({
    event: z.literal("crew"),
    data: z.object({ agent: CrewAgent, activity: CrewActivity, run_id: z.string().nullable(), ticker: z.string().nullable(), at: IsoDateTime }),
  }),
]);
export type DeskEvent = z.infer<typeof DeskEvent>;

export const RunEvent = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("node"),
    data: z.object({
      node: NodeName,
      phase: z.enum(["start", "end"]),
      at: IsoDateTime,
      latency_ms: z.number().int().nullable(),
      tokens_in: z.number().int().nullable(),
      tokens_out: z.number().int().nullable(),
    }),
  }),
  z.object({ event: z.literal("progress"), data: z.object({ pct: z.number().min(0).max(100), note_tr: z.string() }) }),
  z.object({ event: z.literal("interrupt"), data: z.object({ proposal_id: z.string() }) }),
  z.object({ event: z.literal("done"), data: z.object({ status: RunStatus, outcome: RunOutcome.nullable() }) }),
]);
export type RunEvent = z.infer<typeof RunEvent>;

export type StreamEnvelope<E> = E & { id: string };
