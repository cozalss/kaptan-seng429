import { describe, expect, it } from 'vitest';
import { EXIT, EXIT_START, SEA, STORY_BEATS, boatPose, exitAt, frontAt, frontOffset, fullyDryBelow, layerPhase, peak, roll, slope, storyAt, surface, swell } from './sea-swell.js';
import { fragment, swellFunction } from './sea-shader.js';
import { bearing, createNeedleSpring, nearestTurn } from './sea-spring.js';

describe('SEA layers', () => {
  it('run far → near: lower horizons, deeper, darker, taller swell', () => {
    SEA.layers.slice(1).forEach((layer, index) => {
      const farther = SEA.layers[index];
      expect(layer.horizon).toBeLessThan(farther.horizon);
      expect(layer.depth).toBeGreaterThan(farther.depth);
      expect(layer.tone).toBeGreaterThan(farther.tone);
      expect(layer.amp).toBeGreaterThan(farther.amp);
    });
  });

  it('gives every layer its own phase and stretch', () => {
    const phases = SEA.layers.map((_, index) => layerPhase(index).phase);
    expect(new Set(phases).size).toBe(SEA.layers.length);
  });
});

describe('swell', () => {
  it('never exceeds the layer amplitude and calms down with the storm', () => {
    SEA.layers.forEach((layer, index) => {
      let stormy = 0;
      let calm = 0;
      for (let x = 0; x < 2; x += 0.013) {
        const high = Math.abs(swell(x, 3.1, index, 1));
        expect(high).toBeLessThanOrEqual(layer.amp + 1e-9);
        stormy = Math.max(stormy, high);
        calm = Math.max(calm, Math.abs(swell(x, 3.1, index, 0)));
      }
      expect(calm).toBeCloseTo(stormy * SEA.calm, 2);
    });
  });

  it('moves over time and is zero for an unknown layer', () => {
    expect(swell(0.4, 0, 2, 1)).not.toBeCloseTo(swell(0.4, 1, 2, 1), 5);
    expect(swell(0.4, 0, 99, 1)).toBe(0);
    expect(surface(0.4, 0, 99)).toBe(0);
  });
});

describe('surface', () => {
  it('sinks near layers more than far ones as the camera travels in', () => {
    const drop = (index) => surface(0.5, 0, index, { travel: 0 }) - surface(0.5, 0, index, { travel: 1 });
    expect(drop(4)).toBeCloseTo(SEA.travelDrop * SEA.layers[4].depth);
    expect(drop(4)).toBeGreaterThan(drop(0));
  });

  it('shifts with the pointer in proportion to depth', () => {
    const base = surface(0.7, 2, 4, { pointerX: 0 });
    const moved = surface(0.7 - SEA.parallax, 2, 4, { pointerX: 1 });
    expect(moved).toBeCloseTo(base, 10);
  });

  it('has a slope that matches a finite difference', () => {
    const h = 1e-4;
    const expected = (surface(0.3 + h, 1, 2) - surface(0.3 - h, 1, 2)) / (2 * h);
    expect(slope(0.3, 1, 2)).toBeCloseTo(expected, 3);
  });
});

describe('storyAt', () => {
  it('starts in the storm, still, on the first caption, before the outro', () => {
    expect(storyAt(0)).toEqual({ storm: 1, travel: 0, caption: 0, outro: 0 });
  });

  it('ends calm and moved in, with the outro instead of a caption, and clamps', () => {
    const end = storyAt(1);
    expect(end.storm).toBe(0);
    expect(end.travel).toBe(1);
    expect(end.caption).toBe(-1);
    expect(end.outro).toBe(1);
    expect(storyAt(5)).toEqual(end);
    expect(storyAt(-1)).toEqual(storyAt(0));
  });

  it('tells the captions in order, each for a fair share of the scroll', () => {
    expect(storyAt(0.3).caption).toBe(1);
    expect(storyAt(0.5).caption).toBe(2);
    expect(storyAt(0.66).caption).toBe(-1);
    STORY_BEATS.captions.slice(1).forEach((end, i) => expect(end - STORY_BEATS.captions[i]).toBeGreaterThanOrEqual(0.2));
  });

  it('blows the storm out over hero progress 0 → 0.8, monotonically', () => {
    expect(storyAt(0).storm).toBe(1);
    expect(storyAt(STORY_BEATS.storm[1]).storm).toBe(0);
    expect(STORY_BEATS.storm[1]).toBeLessThanOrEqual(0.8);
    let previous = 1;
    for (let p = 0; p <= 1; p += 0.02) {
      const { storm } = storyAt(p);
      expect(storm).toBeLessThanOrEqual(previous + 1e-12);
      previous = storm;
    }
    expect(storyAt(0.6).storm).toBeLessThan(0.05);
  });

  it('sails the boat to centre stage as the last caption is told, before the ink dries', () => {
    expect(STORY_BEATS.outro[0]).toBeGreaterThanOrEqual(STORY_BEATS.captions.at(-1) - 0.05);
    expect(storyAt(0.55).outro).toBe(0);
    expect(storyAt(0.7).outro).toBeGreaterThan(0);
    expect(storyAt(STORY_BEATS.outro[1]).outro).toBe(1);
  });
});

describe('peak', () => {
  it('leaves a calm swell as plain sines and keeps a storm swell within [-1, 1]', () => {
    expect(peak(0.3, 0)).toBeCloseTo(0.3);
    for (let n = -1; n <= 1; n += 0.05) {
      expect(Math.abs(peak(n, 1))).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(peak(1, 1)).toBeCloseTo(1);
    expect(peak(-1, 1)).toBeCloseTo(-1);
  });

  it('sharpens storm crests: mid-swell water sits lower than on a sine', () => {
    expect(peak(0, 1)).toBeLessThan(0);
  });
});

describe('storm swell', () => {
  it('towers in the storm: crests reach ≥ 1.6× the earlier storm swell and ≥ 3.5× the calm one', () => {
    const earlierAmp = [0.008, 0.013, 0.02, 0.03, 0.045];
    SEA.layers.forEach((_, index) => {
      let stormy = 0;
      let calm = 0;
      for (let x = 0; x < 3; x += 0.01) {
        stormy = Math.max(stormy, swell(x, 2, index, 1));
        calm = Math.max(calm, swell(x, 2, index, 0));
      }
      expect(SEA.layers[index].amp).toBeGreaterThanOrEqual(earlierAmp[index] * 1.6 - 1e-9);
      expect(stormy).toBeGreaterThan(SEA.layers[index].amp * 0.4);
      expect(stormy / calm).toBeGreaterThan(3.5);
    });
  });
});

describe('exitAt', () => {
  const seaTop = Math.max(...SEA.layers.map((layer) => layer.horizon - SEA.travelDrop * layer.depth + layer.amp * SEA.calm)) + 0.02;

  it('is untouched while the story is told and starts drying just before the release', () => {
    expect(exitAt(-1)).toEqual({ dry: 0, leave: 0 });
    expect(exitAt(-Infinity)).toEqual({ dry: 0, leave: 0 });
    expect(exitAt(EXIT_START / 2).dry).toBeGreaterThan(0);
    expect(EXIT_START).toBeGreaterThan(-0.3);
    // still water left at the release: the drying is seen, not over before the stage moves
    expect(fullyDryBelow(exitAt(0).dry)).toBeLessThan(seaTop);
  });

  it('declares a ragged margin that covers the silhouette, the wobble and the feathered band', () => {
    const silhouette = EXIT.front.reduce((sum, wave) => sum + wave.amp, 0);
    expect(EXIT.ragged).toBeGreaterThanOrEqual(silhouette + EXIT.wobble + EXIT.feather * 1.8);
    for (let x = 0; x < 3; x += 0.01) expect(Math.abs(frontOffset(x, 0.4))).toBeLessThanOrEqual(silhouette + 1e-9);
    expect(frontAt(0.7, 0.5)).toBeCloseTo(0.5 - frontOffset(0.7, 0.5));
  });

  it('has cleared the calm sea while the next opener is still entering (u ≤ 0.24)', () => {
    expect(fullyDryBelow(exitAt(0.24).dry)).toBeGreaterThan(seaTop);
    // ...but not long before it: water is still drying when the opener's top edge is a tenth in
    expect(exitAt(0.1).dry - EXIT.ragged).toBeLessThan(seaTop);
  });

  it('rises continuously through the release (no jump in height or speed)', () => {
    const e = 1e-4;
    expect(exitAt(-e).dry).toBeCloseTo(exitAt(e).dry, 3);
    const before = (exitAt(-e).dry - exitAt(-2 * e).dry) / e;
    const after = (exitAt(2 * e).dry - exitAt(e).dry) / e;
    expect(before).toBeCloseTo(after, 1);
  });

  it('keeps bare paper above the stage bottom edge at every step of the exit (no straight sea edge)', () => {
    // Once released the stage scrolls up rigidly: u of its height is already off screen. Ink only
    // exists below the sea top, so the margin is needed up to there.
    for (let u = 0; u <= 1; u += 0.01) {
      expect(fullyDryBelow(exitAt(u).dry)).toBeGreaterThanOrEqual(Math.min(u + 0.02, seaTop));
    }
  });

  it('finishes the drift and never runs backwards', () => {
    expect(exitAt(1).leave).toBe(1);
    let previous = 0;
    for (let u = -0.5; u <= 1; u += 0.02) {
      const { dry } = exitAt(u);
      expect(dry).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = dry;
    }
  });
});

describe('boatPose', () => {
  const maxTilt = (storm) => {
    let max = 0;
    for (let t = 0; t < 60; t += 0.05) {
      max = Math.max(max, Math.abs(boatPose({ xShare: 0.74, t, width: 1440, height: 900, storm }).angle));
    }
    return max;
  };

  it('pitches about ±10° in the storm and about ±2° in the calm, never capsizing', () => {
    expect(maxTilt(1)).toBeGreaterThan(8.5);
    expect(maxTilt(1)).toBeLessThanOrEqual(SEA.roll.maxTilt);
    expect(maxTilt(0)).toBeLessThan(2.5);
    expect(maxTilt(0)).toBeGreaterThan(1);
  });

  it('rolls with the storm', () => {
    expect(Math.abs(roll(1.3, 0))).toBeLessThan(Math.abs(roll(1.3, 1)));
  });

  it('puts the keel on the boat layer and tilts with the slope', () => {
    const pose = boatPose({ xShare: 0.3, t: 1.2, width: 1440, height: 900, storm: 1 });
    const x = 0.3 * (1440 / 900);
    expect(pose.left).toBeCloseTo(432);
    expect(pose.top).toBeCloseTo((1 - surface(x, 1.2, SEA.boatLayer, { storm: 1 })) * 900);
    const slopeTilt = (-Math.atan(slope(x, 1.2, SEA.boatLayer, { storm: 1 })) * 180) / Math.PI;
    expect(pose.angle).toBeCloseTo(Math.max(-SEA.roll.maxTilt, Math.min(SEA.roll.maxTilt, slopeTilt + roll(1.2, 1))), 6);
  });
});

describe('needle spring', () => {
  it('measures bearings clockwise from north', () => {
    const o = { x: 0, y: 0 };
    expect(bearing(o, { x: 0, y: -10 })).toBeCloseTo(0);
    expect(bearing(o, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(bearing(o, { x: 0, y: 10 })).toBeCloseTo(180);
    expect(bearing(o, { x: -10, y: 0 })).toBeCloseTo(-90);
  });

  it('takes the short way round', () => {
    expect(nearestTurn(350, 10)).toBeCloseTo(370);
    expect(nearestTurn(10, 350)).toBeCloseTo(-10);
    // Exactly opposite: either way round is equally short.
    expect(Math.abs(nearestTurn(0, 180))).toBeCloseTo(180);
  });

  it('overshoots once, then settles on its target', () => {
    const spring = createNeedleSpring();
    spring.aim(90);
    let peak = 0;
    for (let i = 0; i < 600; i += 1) peak = Math.max(peak, spring.step(1 / 60));
    expect(peak).toBeGreaterThan(90);
    expect(spring.angle).toBeCloseTo(90, 1);
    expect(spring.isSettled(0.1)).toBe(true);
  });

  it('stays stable on a long frame and ignores negative time', () => {
    const spring = createNeedleSpring({ angle: 10 });
    spring.aim(-80);
    expect(spring.target).toBeCloseTo(-80);
    expect(Number.isFinite(spring.step(5))).toBe(true);
    const before = spring.angle;
    expect(spring.step(-1)).toBe(before);
  });
});

describe('sea shader', () => {
  it('looks every layer up from SEA, loops over them once and declares the drying uniforms', () => {
    const source = fragment({ octaves: 3 });
    SEA.layers.forEach((layer, index) => expect(source).toContain(`if (i == ${index}) return vec4(${layer.horizon}`));
    expect(source).toContain(`index < ${SEA.layers.length}`);
    expect(source).toContain('uniform float uDry;');
    expect(source).toContain('uniform float uDpr;');
    expect(source).toContain('i < 3;');
    expect(swellFunction()).toContain(String(SEA.crest));
  });
});

describe('seaPixelRatio', () => {
  it('uses the screen DPR up to the cap and the per-frame pixel budget', async () => {
    const { seaPixelRatio } = await import('./sea-renderer.js');
    const base = { maxDpr: 1.5, budget: 3.4e6, minDpr: 0.75 };
    expect(seaPixelRatio({ ...base, width: 1440, height: 900, dpr: 1 })).toBe(1);
    expect(seaPixelRatio({ ...base, width: 1440, height: 900, dpr: 2 })).toBe(1.5);
    const big = seaPixelRatio({ ...base, width: 2560, height: 1200, dpr: 2 });
    expect(2560 * 1200 * big * big).toBeLessThanOrEqual(3.4e6 + 1);
    expect(seaPixelRatio({ ...base, width: 8000, height: 5000, dpr: 2 })).toBe(0.75);
    expect(seaPixelRatio({ ...base, width: 390, height: 844, dpr: undefined })).toBe(1);
  });
});
