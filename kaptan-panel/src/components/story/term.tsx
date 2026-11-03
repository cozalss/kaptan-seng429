"use client";

import type { ReactNode } from "react";
import { Popover as P } from "radix-ui";
import { DICTIONARY, type DictionaryWord } from "./dictionary";
import "./term.css";

/**
 * An unavoidable finance word, explained where it is read: a dotted underline that opens one plain
 * line. It is a real button, so a tap, Enter and Space all open it and Escape closes it. Pass the
 * inflected form as children: `<Term word="geri alım">geri alımı</Term>`. Use it once per word on a
 * screen, on the first mention, and only for words a person cannot be spared.
 */
export function Term({ word, children }: { word: DictionaryWord; children?: ReactNode }) {
  return (
    <P.Root>
      <P.Trigger type="button" className="term-word" aria-label={`${typeof children === "string" ? children : word}: ne demek?`}>
        {children ?? word}
      </P.Trigger>
      <P.Portal>
        <P.Content side="top" align="center" sideOffset={8} collisionPadding={12} aria-label={`${word}: anlamı`} className="term-meaning">
          <span className="term-meaning-word">{word}</span> {DICTIONARY[word]}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
