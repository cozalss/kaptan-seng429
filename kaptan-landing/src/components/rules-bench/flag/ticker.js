// One requestAnimationFrame loop shared by every pennant stage on the page. It runs only while some
// stage is awake; a stage unsubscribes itself when its cloth has settled, so an idle page draws nothing.

const subscribers = new Set();
let raf = 0;
let last = 0;

function loop(now) {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  for (const fn of subscribers) fn(dt);
  raf = subscribers.size ? requestAnimationFrame(loop) : 0;
  if (!raf) last = 0;
}

/** Calls fn(dt seconds) every frame until the returned function is called. */
export function subscribe(fn) {
  subscribers.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
  };
}

/** How many stages are awake (for tests and QA). */
export function awake() {
  return subscribers.size;
}
