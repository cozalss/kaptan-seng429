import { dayLabel, inWords, KIND_LABEL } from "@/lib/agenda/agenda";
import type { CalendarEvent } from "@/lib/domain/agenda";
import { TickerLink } from "@/components/company/ticker-link";

/** One upcoming date: when, what, why it is on the list, and where it was read. */
export function EventRow({ event, today }: { event: CalendarEvent; today: string }) {
  return (
    <li className="ag-item">
      <p className="ag-when">
        {dayLabel(event.day, today)}
        <small>{inWords(event.day, today)}</small>
      </p>
      <div>
        <p className="ag-title">
          {event.ticker ? <TickerLink ticker={event.ticker} className="mr-2 font-bold" /> : null}
          {event.title.replace(/^[A-Z0-9]{3,6}: /, "")}
        </p>
        <p className="ag-detail">{event.detail}</p>
        <p className="ag-tags">
          <span className="sr-only">{KIND_LABEL[event.kind]}.</span>
          <span className={event.approximate ? "ag-tag ag-tag--maybe" : "ag-tag"}>{event.approximate ? "Tahmini gün" : "Açıklanan gün"}</span>
          {event.why === "held" ? <span>Elinde var</span> : event.why === "watched" ? <span>İzliyorsun</span> : null}
          {event.source_url ? (
            <a href={event.source_url} target="_blank" rel="noreferrer noopener" className="ag-link">
              Kaynağı aç
            </a>
          ) : null}
        </p>
      </div>
    </li>
  );
}
