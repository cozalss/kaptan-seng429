const TILE_PX = 128;
const GRAIN_VAR = '--grain-image';

/** Renders one tile of monochrome noise to a PNG data URL (null when canvas is unavailable). */
export function createGrainTile(size = TILE_PX, random = Math.random) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext?.('2d');
  if (!context) return null;

  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.floor(random() * 256);
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Static film grain over the photography layers only. The tile is generated once at runtime and
 * exposed as a CSS variable that the layers' ::after pseudo-elements tile (see grain.css).
 */
export function initGrain(layers) {
  const targets = [...layers].filter(Boolean);
  if (!targets.length) return;
  let url = null;
  try {
    url = createGrainTile();
  } catch (error) {
    // A tainted/blocked canvas only costs the texture; the photography still renders.
    console.warn('[kaptan] grain unavailable', error);
  }
  if (!url) return;
  targets.forEach((layer) => {
    layer.style.setProperty(GRAIN_VAR, `url("${url}")`);
    layer.classList.add('has-grain');
  });
}
