import { describe, expect, it } from "vitest";
import {
  CHORD_MS,
  IDLE,
  step,
  type ChordState,
  type KeyInput,
} from "./shortcut-list";

const press = (
  state: ChordState,
  key: string,
  at: number,
  over: Partial<KeyInput> = {},
) => step(state, { key, modified: false, typing: false, now: at, ...over });

describe("keyboard shortcuts", () => {
  it("g then a letter goes to its screen", () => {
    const first = press(IDLE, "g", 1000);
    expect(first.action).toBeNull();
    expect(press(first.state, "a", 1200).action).toEqual({
      kind: "go",
      path: "/benim",
    });
    expect(press(press(IDLE, "g", 0).state, "p", 10).action).toEqual({
      kind: "go",
      path: "/portfoy",
    });
    expect(press(press(IDLE, "g", 0).state, "o", 10).action).toEqual({
      kind: "go",
      path: "/bildirimler",
    });
    expect(press(press(IDLE, "g", 0).state, "g", 10).action).toEqual({
      kind: "go",
      path: "/gecmis",
    });
    expect(press(press(IDLE, "g", 0).state, "y", 10).action).toEqual({
      kind: "go",
      path: "/ayarlar",
    });
  });

  it("forgets the g after a moment, or after a letter that means nothing", () => {
    const armed = press(IDLE, "g", 0).state;
    expect(press(armed, "a", CHORD_MS + 1).action).toBeNull();
    const wrong = press(armed, "x", 100);
    expect(wrong.state).toEqual(IDLE);
    expect(press(wrong.state, "a", 150).action).toBeNull();
  });

  it("? lists the shortcuts", () => {
    expect(press(IDLE, "?", 0).action).toEqual({ kind: "help" });
  });

  it("never reacts while typing, with a modifier, or to the search keys", () => {
    expect(press(IDLE, "g", 0, { typing: true }).state).toEqual(IDLE);
    expect(
      press(press(IDLE, "g", 0).state, "a", 10, { typing: true }).action,
    ).toBeNull();
    expect(press(IDLE, "g", 0, { modified: true }).state).toEqual(IDLE);
    expect(press(IDLE, "/", 0).action).toBeNull(); // the search owns "/"
    expect(press(IDLE, "k", 0, { modified: true }).action).toBeNull(); // and Ctrl+K
  });
});
