/**
 * Bodoni's %, ×, @, ±, + and − glyphs read as ornaments at display sizes ("%18" looks like
 * "°/o18"). Inside Bodoni text, set those signs in Inter so numbers stay legible — the same
 * idea as the shared `Numeral`, for running sentences.
 */
const SIGNS = /([%×@±+−÷=]|(?<=\d),(?=\d))/;

export function DisplayText({ text }: { text: string }) {
  const parts = text.split(SIGNS).filter((p): p is string => p !== undefined);
  return (
    <>
      {parts.map((p, i) =>
        p.length === 1 && /[%×@±+−÷=,]/.test(p) ? (
          <span key={i} className="mx-[0.03em] font-sans text-[0.72em] font-normal">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
