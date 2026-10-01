// Minimal WOFF2 → TrueType decoder (build-time only), so librsvg can draw the site's own fonts.
// librsvg ignores @font-face data URIs and the bundled FreeType has no Brotli, so the visuals build
// decodes public/fonts/*.woff2 into plain .ttf files and points fontconfig at them.
// Implements the W3C WOFF2 spec for single-font files: Brotli stream, glyf/loca transform
// (triplet-encoded points, composite and bbox streams) and the optional hmtx transform.

import { brotliDecompressSync } from 'node:zlib';

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep',
  'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE',
  'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt',
  'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar',
  'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

/** Sequential big-endian reader over a Buffer. */
class Reader {
  constructor(buffer, offset = 0) {
    this.buf = buffer;
    this.pos = offset;
  }
  u8() { return this.buf.readUInt8(this.pos++); }
  u16() { const v = this.buf.readUInt16BE(this.pos); this.pos += 2; return v; }
  i16() { const v = this.buf.readInt16BE(this.pos); this.pos += 2; return v; }
  u32() { const v = this.buf.readUInt32BE(this.pos); this.pos += 4; return v; }
  bytes(n) { const v = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return v; }
  base128() {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
      const byte = this.u8();
      if (i === 0 && byte === 0x80) throw new Error('woff2: UIntBase128 with leading zero');
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('woff2: UIntBase128 too long');
  }
  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}

const withSign = (flag, value) => (flag & 1 ? value : -value);

/** One triplet-encoded point delta (WOFF2 §5.2). */
function tripletDelta(flag, glyph) {
  if (flag < 10) return [0, withSign(flag, ((flag & 14) << 7) + glyph.u8())];
  if (flag < 20) return [withSign(flag, (((flag - 10) & 14) << 7) + glyph.u8()), 0];
  if (flag < 84) {
    const b0 = flag - 20;
    const b1 = glyph.u8();
    return [withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4)), withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f))];
  }
  if (flag < 120) {
    const b0 = flag - 84;
    const a = glyph.u8();
    const b = glyph.u8();
    return [withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + a), withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + b)];
  }
  if (flag < 124) {
    const a = glyph.u8();
    const b = glyph.u8();
    const c = glyph.u8();
    return [withSign(flag, (a << 4) + (b >> 4)), withSign(flag >> 1, ((b & 0x0f) << 8) + c)];
  }
  const a = glyph.u16();
  const b = glyph.u16();
  return [withSign(flag, a), withSign(flag >> 1, b)];
}

function encodeSimpleGlyph(nContours, endPts, points, bbox, instructions) {
  const n = points.length;
  const out = Buffer.alloc(10 + 2 * nContours + 2 + instructions.length + n + 4 * n);
  let p = out.writeInt16BE(nContours, 0);
  for (const v of bbox) p = out.writeInt16BE(v, p);
  for (const e of endPts) p = out.writeUInt16BE(e, p);
  p = out.writeUInt16BE(instructions.length, p);
  p += instructions.copy(out, p);
  for (const pt of points) p = out.writeUInt8(pt.on ? 1 : 0, p);
  let prev = 0;
  for (const pt of points) { p = out.writeInt16BE(pt.x - prev, p); prev = pt.x; }
  prev = 0;
  for (const pt of points) { p = out.writeInt16BE(pt.y - prev, p); prev = pt.y; }
  return out;
}

function readComposite(composite) {
  const start = composite.pos;
  let flags;
  let hasInstructions = false;
  do {
    flags = composite.u16();
    composite.u16(); // glyph index
    composite.pos += flags & 0x0001 ? 4 : 2;
    if (flags & 0x0008) composite.pos += 2;
    else if (flags & 0x0040) composite.pos += 4;
    else if (flags & 0x0080) composite.pos += 8;
    if (flags & 0x0100) hasInstructions = true;
  } while (flags & 0x0020);
  return { data: composite.buf.subarray(start, composite.pos), hasInstructions };
}

/** Rebuilds glyf + loca from the transformed glyf stream. Returns long-format loca. */
function reconstructGlyf(data) {
  const head = new Reader(data);
  head.u16(); // reserved
  const optionFlags = head.u16();
  const numGlyphs = head.u16();
  head.u16(); // indexFormat (we always write long loca)
  const sizes = Array.from({ length: 7 }, () => head.u32());
  let offset = head.pos;
  const streams = sizes.map((size) => {
    const r = new Reader(data, offset);
    offset += size;
    return r;
  });
  const [nContourS, nPointsS, flagS, glyphS, compositeS, bboxS, instrS] = streams;
  const bboxBitmapLen = 4 * Math.floor((numGlyphs + 31) / 32);
  const bboxBitmap = bboxS.bytes(bboxBitmapLen);
  if (optionFlags & 1) { /* overlapSimpleBitmap: irrelevant for rasterising */ }
  const hasBbox = (i) => (bboxBitmap[i >> 3] & (0x80 >> (i & 7))) !== 0;

  const glyphs = [];
  const xMins = [];
  for (let i = 0; i < numGlyphs; i += 1) {
    const nContours = nContourS.i16();
    if (nContours === 0) {
      glyphs.push(Buffer.alloc(0));
      xMins.push(0);
      continue;
    }
    if (nContours === -1) {
      const bbox = [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()];
      const { data: comp, hasInstructions } = readComposite(compositeS);
      let instructions = Buffer.alloc(0);
      if (hasInstructions) instructions = instrS.bytes(glyphS.u255());
      const out = Buffer.alloc(10 + comp.length + (hasInstructions ? 2 + instructions.length : 0));
      let p = out.writeInt16BE(-1, 0);
      for (const v of bbox) p = out.writeInt16BE(v, p);
      p += comp.copy(out, p);
      if (hasInstructions) {
        p = out.writeUInt16BE(instructions.length, p);
        instructions.copy(out, p);
      }
      glyphs.push(out);
      xMins.push(bbox[0]);
      continue;
    }
    const endPts = [];
    let total = 0;
    for (let c = 0; c < nContours; c += 1) {
      total += nPointsS.u255();
      endPts.push(total - 1);
    }
    const points = [];
    let x = 0;
    let y = 0;
    for (let k = 0; k < total; k += 1) {
      const raw = flagS.u8();
      const [dx, dy] = tripletDelta(raw & 0x7f, glyphS);
      x += dx;
      y += dy;
      points.push({ x, y, on: !(raw >> 7) });
    }
    const instructions = instrS.bytes(glyphS.u255());
    let bbox;
    if (hasBbox(i)) bbox = [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()];
    else {
      const xs = points.map((pt) => pt.x);
      const ys = points.map((pt) => pt.y);
      bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    glyphs.push(encodeSimpleGlyph(nContours, endPts, points, bbox, instructions));
    xMins.push(bbox[0]);
  }

  const padded = glyphs.map((g) => (g.length % 4 ? Buffer.concat([g, Buffer.alloc(4 - (g.length % 4))]) : g));
  const loca = Buffer.alloc(4 * (numGlyphs + 1));
  let acc = 0;
  padded.forEach((g, i) => {
    loca.writeUInt32BE(acc, 4 * i);
    acc += g.length;
  });
  loca.writeUInt32BE(acc, 4 * numGlyphs);
  return { glyf: Buffer.concat(padded), loca, xMins, numGlyphs };
}

function reconstructHmtx(data, numGlyphs, numHMetrics, xMins) {
  const r = new Reader(data);
  const flags = r.u8();
  const adv = Array.from({ length: numHMetrics }, () => r.u16());
  const lsb = Array.from({ length: numHMetrics }, (_, i) => (flags & 1 ? xMins[i] : r.i16()));
  const extra = Array.from({ length: numGlyphs - numHMetrics }, (_, i) => (flags & 2 ? xMins[numHMetrics + i] : r.i16()));
  const out = Buffer.alloc(4 * numHMetrics + 2 * (numGlyphs - numHMetrics));
  let p = 0;
  for (let i = 0; i < numHMetrics; i += 1) {
    p = out.writeUInt16BE(adv[i], p);
    p = out.writeInt16BE(lsb[i], p);
  }
  for (const v of extra) p = out.writeInt16BE(v, p);
  return out;
}

function checksum(buf) {
  const padded = buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))]) : buf;
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

function writeSfnt(flavor, tables) {
  const tags = Object.keys(tables).sort();
  const numTables = tags.length;
  const maxPow2 = 2 ** Math.floor(Math.log2(numTables));
  const header = Buffer.alloc(12 + 16 * numTables);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(maxPow2 * 16, 6);
  header.writeUInt16BE(Math.log2(maxPow2), 8);
  header.writeUInt16BE(numTables * 16 - maxPow2 * 16, 10);
  let offset = header.length;
  const bodies = [];
  tags.forEach((tag, i) => {
    const data = tables[tag];
    const rec = 12 + 16 * i;
    header.write(tag, rec, 4, 'latin1');
    header.writeUInt32BE(checksum(data), rec + 4);
    header.writeUInt32BE(offset, rec + 8);
    header.writeUInt32BE(data.length, rec + 12);
    const pad = (4 - (data.length % 4)) % 4;
    bodies.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
  });
  return Buffer.concat([header, ...bodies]);
}

/** Decodes a single-font WOFF2 file into an sfnt (TrueType/OpenType) buffer. */
export function woff2ToSfnt(input) {
  const r = new Reader(input);
  if (r.u32() !== 0x774f4632) throw new Error('woff2: bad signature');
  const flavor = r.u32();
  if (flavor === 0x74746366) throw new Error('woff2: font collections are not supported');
  r.u32(); // length
  const numTables = r.u16();
  r.u16();
  r.u32(); // totalSfntSize
  const totalCompressedSize = r.u32();
  r.pos += 24; // versions, meta and private blocks

  const dir = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = r.u8();
    const tagIndex = flags & 0x3f;
    const tag = tagIndex === 63 ? r.bytes(4).toString('latin1') : KNOWN_TAGS[tagIndex];
    const version = (flags >> 6) & 3;
    const origLength = r.base128();
    const isGlyfLoca = tag === 'glyf' || tag === 'loca';
    const transformed = isGlyfLoca ? version === 0 : version !== 0;
    const length = transformed ? r.base128() : origLength;
    dir.push({ tag, transformed, length });
  }
  const stream = brotliDecompressSync(input.subarray(r.pos, r.pos + totalCompressedSize));
  let offset = 0;
  const raw = {};
  for (const entry of dir) {
    raw[entry.tag] = { ...entry, data: stream.subarray(offset, offset + entry.length) };
    offset += entry.length;
  }

  const tables = {};
  for (const [tag, entry] of Object.entries(raw)) {
    if (!entry.transformed) tables[tag] = Buffer.from(entry.data);
  }
  if (raw.glyf?.transformed) {
    const { glyf, loca, xMins, numGlyphs } = reconstructGlyf(raw.glyf.data);
    tables.glyf = glyf;
    tables.loca = loca;
    tables.head.writeInt16BE(1, 50); // indexToLocFormat: long offsets
    if (raw.hmtx?.transformed) {
      const numHMetrics = tables.hhea.readUInt16BE(34);
      tables.hmtx = reconstructHmtx(raw.hmtx.data, numGlyphs, numHMetrics, xMins);
    }
  } else if (raw.hmtx?.transformed) {
    throw new Error('woff2: transformed hmtx without transformed glyf is not supported');
  }
  if (tables.head) tables.head.writeUInt32BE(0, 8); // checksumAdjustment: not needed for rendering
  return writeSfnt(flavor, tables);
}
