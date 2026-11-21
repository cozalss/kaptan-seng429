"use client";

import { useId } from "react";
import {
  TEXT_LABEL,
  TEXT_SIZES,
  THEME_LABEL,
  THEMES,
  useLook,
} from "@/lib/prefs/look";
import "./comfort.css";

/** Görünüm: light, dark or like the device, and three text sizes. Remembered on this computer, shown at once. */
export function LookSection() {
  const [look, setLook] = useLook();
  return (
    <section aria-labelledby="gorunum-baslik" id="gorunum" className="ay-block">
      <h2 id="gorunum-baslik">
        <span className="pf-name">
          Görünüm<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">
          Ekranı sana göre ayarla.
        </span>
      </h2>
      <p className="ay-block-lead">
        Bu seçimler yalnızca bu bilgisayarda geçerli olur.
      </p>
      <Choice
        name="Tema"
        values={THEMES}
        labels={THEME_LABEL}
        value={look.theme}
        onPick={(theme) => setLook({ theme })}
      />
      <Choice
        name="Yazı boyutu"
        values={TEXT_SIZES}
        labels={TEXT_LABEL}
        value={look.text}
        onPick={(text) => setLook({ text })}
      />
    </section>
  );
}

function Choice<T extends string>({
  name,
  values,
  labels,
  value,
  onPick,
}: {
  name: string;
  values: readonly T[];
  labels: Readonly<Record<T, string>>;
  value: T;
  onPick: (v: T) => void;
}) {
  const group = useId();
  return (
    <fieldset className="cf-seg">
      <legend className="cf-label">{name}</legend>
      <div className="cf-seg-row">
        {values.map((v) => (
          <label key={v} className="cf-seg-item">
            <input
              type="radio"
              name={group}
              value={v}
              checked={value === v}
              onChange={() => onPick(v)}
            />
            <span>{labels[v]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
