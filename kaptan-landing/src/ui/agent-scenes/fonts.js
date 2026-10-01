// The book's faces as canvas font stacks (tokens.css), and a short wait for them before the agent
// scenes ink their printed matter.

export const DISPLAY = "'Bodoni Moda Display', 'Didot', Georgia, serif";
export const SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif";
export const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

/** Resolves once the display and text faces are loaded, or after `timeout` ms — never rejects. */
export async function fontsReady(doc, timeout = 900) {
  if (!doc?.fonts?.load) return;
  const wait = Promise.all([doc.fonts.load(`23px ${DISPLAY}`, 'Genel kurul'), doc.fonts.load(`500 13px ${SANS}`, 'ÖRNEK Diğer')]);
  await Promise.race([wait, new Promise((resolve) => setTimeout(resolve, timeout))]).catch(() => {});
}
