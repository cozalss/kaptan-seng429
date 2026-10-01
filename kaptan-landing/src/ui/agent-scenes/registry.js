// Which agents have a live plate, keyed by agent id (src/data/agents.js). Each entry loads its
// scene module on demand (its own chunk), so the detail page pays for a scene only when it opens.
// Agents without an entry show no plate at all — never an empty frame.

export const SCENE_LOADERS = Object.freeze({
  siniflandirici: () => import('./siniflandirici/index.js'),
  onemlilik: () => import('./onemlilik/index.js'),
  okuyucu: () => import('./okuyucu/index.js'),
  kanit: () => import('./kanit/index.js'),
  uyum: () => import('./uyum/index.js'),
  'kural-motoru': () => import('./kural-motoru/index.js'),
  supheci: () => import('./supheci/index.js'),
  'risk-kapisi': () => import('./risk-kapisi/index.js'),
  // okuyucu, onemlilik, kanit, supheci, uyum, kural-motoru, risk-kapisi: see SCENES.md
});

/** Whether `agentId` has a live plate. */
export function hasAgentScene(agentId, loaders = SCENE_LOADERS) {
  return Object.prototype.hasOwnProperty.call(loaders, agentId);
}
