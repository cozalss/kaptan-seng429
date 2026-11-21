import "./oneri-outside.css";

/**
 * A stock outside the list KAPtan follows, analysed only because you watch it: said plainly above the story,
 * because thin trading makes the shown price harder to get (the amount is already capped by daily turnover).
 */
export function OutsideListNote({ text }: { text: string }) {
  return (
    <aside className="oneri-outside" aria-label="Bu hisse listenin dışında">
      <p className="oneri-outside-head">Listenin dışında bir hisse</p>
      <p>{text}</p>
    </aside>
  );
}
