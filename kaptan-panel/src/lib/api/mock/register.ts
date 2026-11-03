import { registerLocalRuntime } from "../local-runtime";
import { getMockDb } from "./db";
import { nowMs } from "./selectors";

registerLocalRuntime({
  nowMs: () => nowMs(getMockDb().snapshot),
  subscribe: (key, handler) => getMockDb().bus.subscribe(key, handler),
});
