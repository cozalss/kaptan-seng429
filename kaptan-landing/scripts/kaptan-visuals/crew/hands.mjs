// Crew portraits — reusable hands. Each is drawn once in a local frame and placed on the plate
// with style.place({ origin, angle, scale, mirror }). Local frame: ~215 units from wrist to
// fingertip (a hand is about as long as the face is tall at the crew head size, so place them at
// scale 1–1.25), thumb side toward −y. `mirror: true` gives the other hand.

import { PAPER, brush, mass, strokes, wash } from './style.mjs';

/** Hand flat, fingers together (wrist at 0,0, fingers toward +x, thumb side = −y). Back of the hand. */
export function flatHand(r) {
  const out = [];
  const outline = [[0, -34], [50, -40], [92, -56], [118, -64], [130, -56], [118, -44], [104, -36], [150, -36], [196, -28], [210, -18], [218, -4], [216, 12], [196, 28], [150, 38], [104, 42], [56, 44], [0, 38]];
  out.push(mass(outline, { fill: PAPER }));
  out.push(wash([[40, 20], [110, 30], [180, 30], [200, 24], [120, 44], [50, 44]], { opacity: 0.25 }));
  out.push(brush([[0, -34], [50, -40], [92, -56], [118, -64], [131, -57], [118, -45], [104, -37]], { w: [4, 4, 5, 5, 4, 3, 2], taper: [0.05, 0.2], r }));
  out.push(brush([[98, -36], [150, -36], [196, -29], [210, -19], [218, -4], [216, 12], [197, 28], [150, 38], [104, 43], [56, 45], [2, 38]], { w: [2, 3, 4, 4, 4, 5, 6, 6, 6, 5, 4], taper: [0.1, 0.05], r }));
  out.push(strokes([
    [[146, -20], [184, -14], [206, -8]],
    [[148, -2], [190, 2], [212, 4]],
    [[146, 14], [180, 18], [202, 18]],
  ], { w: 2.6, taper: [0.2, 0.5], r }));
  out.push(strokes([[[112, -26], [120, -20]], [[114, -6], [122, 0]], [[112, 12], [120, 18]]], { w: 2.2, taper: [0.3, 0.3], r, opacity: 0.6 }));
  out.push(brush([[196, -24], [206, -16]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.7 }));
  return out.join('');
}

/** Hand pointing (fingertip at 0,0, wrist toward +x, thumb side = −y): index out, the rest curled under. */
export function pointingHand(r) {
  const out = [];
  const outline = [[0, -9], [40, -13], [96, -16], [104, -24], [98, -34], [118, -40], [150, -30], [214, -24], [216, 34], [186, 60], [160, 62], [138, 56], [114, 46], [96, 38], [90, 16], [40, 12], [4, 10], [-4, 0]];
  out.push(mass(outline, { fill: PAPER }));
  out.push(wash([[96, 30], [140, 52], [190, 56], [214, 30], [170, 40], [120, 30]], { opacity: 0.25 }));
  out.push(brush([[-4, -1], [2, -9], [40, -13], [96, -16], [106, -24]], { w: [2, 3, 3.5, 4, 3], taper: [0.05, 0.1], r }));
  out.push(brush([[100, -22], [98, -34], [118, -41], [150, -31], [214, -25]], { w: [3, 4, 5, 5, 4], taper: [0.1, 0.1], r }));
  out.push(brush([[-4, 1], [4, 10], [40, 12], [88, 14]], { w: [2, 3, 4, 4], taper: [0.05, 0.2], r }));
  out.push(brush([[86, 10], [92, 30], [112, 44], [136, 48]], { w: [4, 5, 5, 4], taper: [0.2, 0.2], r }));
  out.push(brush([[124, 46], [140, 58], [162, 62], [186, 58]], { w: [3, 5, 6, 5], taper: [0.2, 0.2], r }));
  out.push(brush([[178, 58], [200, 50], [216, 34]], { w: [5, 5, 4], taper: [0.1, 0.1], r }));
  out.push(strokes([[[98, 20], [110, 26], [128, 28]], [[130, 44], [146, 44]]], { w: 2.4, taper: [0.3, 0.3], r }));
  out.push(brush([[6, -5], [18, -6]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.8 }));
  out.push(brush([[58, -12], [62, -4]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.6 }));
  return out.join('');
}


/**
 * Fist gripping a bar (rope, spoke, spyglass, chain) seen from the back of the hand. Local
 * frame: the bar runs along the y axis through x = 0 (draw it before the hand, so the fingers
 * close over it); wrist toward +x; thumb side = −y (the thumb wraps over the top).
 */
export function gripHand(r) {
  const out = [];
  const fingers = [-36, -12, 12, 36]; // centre line of each curled finger
  const front = [];
  fingers.forEach((y, i) => {
    const bulge = i === 0 || i === 3 ? 8 : 12;
    front.push([-bulge + 4, y - 11], [-bulge, y], [-bulge + 4, y + 11]);
  });
  const outline = [[172, -40], [110, -48], [56, -52], [20, -50], ...front, [20, 50], [56, 50], [110, 46], [172, 38]];
  out.push(mass(outline, { fill: PAPER }));
  out.push(wash([[-6, 20], [20, 48], [80, 48], [150, 40], [90, 34], [30, 26]], { opacity: 0.26 }));
  // contour: back of the hand, the scalloped curl of the fingers, the heel of the hand
  out.push(brush([[174, -40], [110, -48], [56, -52], [20, -50], [0, -47]], { w: [4, 5, 5, 4, 3], taper: [0.05, 0.1], r }));
  out.push(brush([[2, -47], ...front, [4, 46]], { w: 4.2, taper: [0.05, 0.05], r, step: 4 }));
  out.push(brush([[2, 46], [20, 51], [56, 51], [110, 47], [174, 38]], { w: [4, 6, 6, 5, 4], taper: [0.05, 0.1], r }));
  // finger splits and knuckles
  out.push(strokes([-24, 0, 24].map((y) => [[-4, y], [22, y + 1], [50, y]]), { w: 2.6, taper: [0.1, 0.5], r }));
  out.push(strokes(fingers.map((y) => [[58, y - 8], [62, y], [58, y + 8]]), { w: 2.4, taper: [0.3, 0.3], r, opacity: 0.6 }));
  // thumb wrapped over the top of the bar
  const thumb = [[112, -46], [64, -58], [22, -64], [-4, -60], [-6, -50], [20, -50], [60, -48]];
  out.push(mass(thumb, { fill: PAPER }));
  out.push(brush([[112, -46], [64, -58], [22, -64], [-2, -61], [-7, -52], [4, -48]], { w: [3, 4, 4, 4, 3, 2], taper: [0.1, 0.2], r }));
  out.push(brush([[2, -58], [12, -58]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.7 }));
  return out.join('');
}
