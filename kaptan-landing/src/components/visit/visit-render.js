// Fills the footer's project links from SITE so site facts live in one place (src/config/site.js).
// The markup carries a static fallback; this only refines it into real links.

const PENDING_SUFFIX = ' · yakında';
const NEW_TAB_NOTE = ' (yeni sekmede açılır)';

/**
 * One project link: a real, new-tab link when SITE has its URL, otherwise a muted non-link
 * ("… · yakında") — never a dead "#".
 */
export function bindProjectLink(node, url) {
  const label = node.dataset.linkLabel ?? node.textContent.trim();
  if (typeof url === 'string' && /^https:\/\//.test(url)) {
    const link = document.createElement('a');
    link.className = node.className;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.dataset.siteLink = node.dataset.siteLink;
    link.dataset.linkLabel = label;
    const note = document.createElement('span');
    note.className = 'visually-hidden';
    note.textContent = NEW_TAB_NOTE;
    link.append(label, note);
    link.classList.remove('is-pending');
    node.replaceWith(link);
    return link;
  }
  node.classList.add('is-pending');
  node.dataset.linkLabel = label;
  node.textContent = `${label}${PENDING_SUFFIX}`;
  return node;
}

/** Applies SITE links to every [data-site-link="<links key>"]. */
export function bindSiteContent(site, root = document) {
  root.querySelectorAll('[data-site-link]').forEach((node) => bindProjectLink(node, site.links?.[node.dataset.siteLink]));
}
