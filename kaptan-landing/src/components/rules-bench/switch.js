// The rule switch: the four rule titles (and the "Sızıntıyı dene" text button) choose which ONE
// instrument the shared slot shows. Titles become real <button aria-pressed aria-controls>;
// ↑/↓ (←/→), Home and End move between them. All instruments stay in the slot (stacked, only the
// chosen one visible and not inert), so switching never moves the page.

const ACTIVE = 'is-active';
const STEP = Object.freeze({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 });

/**
 * @param {{ section: HTMLElement, onSelect?: (id: string, how: { user: boolean }) => void }} options
 * @returns {{ select(id: string, how?: { user?: boolean }): void, current(): string | null, destroy(): void }}
 */
export function createSwitch({ section, onSelect = () => {} }) {
  const slot = section.querySelector('.rules__slot');
  const hosts = [...section.querySelectorAll('.rules__slot [data-instrument]')];
  const rows = [...section.querySelectorAll('.articles > [data-rule]')].map((row) => {
    const name = row.querySelector('.article__name');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'article__toggle';
    button.append(...name.childNodes);
    name.append(button);
    return { id: row.dataset.rule, row, name, button };
  });
  const tryLeak = section.querySelector('[data-show="leak"]');
  const buttons = [...rows.map((entry) => entry.button), ...(tryLeak ? [tryLeak] : [])];
  buttons.forEach((button) => {
    if (slot?.id) button.setAttribute('aria-controls', slot.id);
  });
  if (tryLeak) tryLeak.hidden = false;

  let current = null;
  const apply = (id) => {
    rows.forEach(({ id: rowId, row, button }) => {
      row.classList.toggle(ACTIVE, rowId === id);
      button.setAttribute('aria-pressed', String(rowId === id));
    });
    tryLeak?.setAttribute('aria-pressed', String(id === 'leak'));
    hosts.forEach((host) => {
      const shown = host.dataset.instrument === id;
      host.classList.toggle(ACTIVE, shown);
      host.inert = !shown;
    });
    current = id;
  };

  const select = (id, { user = false } = {}) => {
    if (id === current || !hosts.some((host) => host.dataset.instrument === id)) return;
    apply(id);
    onSelect(id, { user });
  };

  const idOf = (button) => (button === tryLeak ? 'leak' : rows.find((entry) => entry.button === button).id);
  const onClick = (event) => select(idOf(event.currentTarget), { user: true });
  const onKey = (event) => {
    const titles = rows.map((entry) => entry.button);
    const index = titles.indexOf(event.currentTarget);
    let next = null;
    if (event.key in STEP) next = (index + STEP[event.key] + titles.length) % titles.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = titles.length - 1;
    if (next === null) return;
    event.preventDefault();
    titles[next].focus();
  };
  buttons.forEach((button) => button.addEventListener('click', onClick));
  rows.forEach(({ button }) => button.addEventListener('keydown', onKey));

  apply((rows.find((entry) => entry.row.classList.contains(ACTIVE)) ?? rows[0])?.id ?? null);

  return {
    select,
    current: () => current,
    destroy() {
      buttons.forEach((button) => button.removeEventListener('click', onClick));
      rows.forEach(({ row, name, button }) => {
        button.removeEventListener('keydown', onKey);
        name.append(...button.childNodes);
        button.remove();
        row.classList.toggle(ACTIVE, row.dataset.rule === 'E1');
      });
      hosts.forEach((host) => {
        host.classList.remove(ACTIVE);
        host.inert = false;
      });
      if (tryLeak) {
        tryLeak.hidden = true;
        tryLeak.removeAttribute('aria-pressed');
      }
    },
  };
}
