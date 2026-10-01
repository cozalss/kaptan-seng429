/**
 * Wraps a matchMedia context so one failing effect never takes the others down. Whatever the
 * context created before throwing is still reverted by gsap.matchMedia (it records tweens and
 * triggers), and the returned cleanup is only called when setup succeeded.
 * The matchMedia context (with `conditions`) is passed through to `setup`.
 */
export function guarded(label, setup) {
  return (context) => {
    try {
      return setup(context);
    } catch (error) {
      console.error(`[kaptan] motion "${label}" failed`, error);
      return undefined;
    }
  };
}
