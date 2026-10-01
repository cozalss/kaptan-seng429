// The eight agent plates (3:4, drawn in a 1200 × 1600 box): the crew of the boat crossing the storm
// of disclosures, one sailor per agent, drawn in sumi ink (./crew, see crew/STYLE.md).
// Each plate: { title, focus: {x, y, zoom} for the detail frame, draw(r) → SVG body }.

import CREW_1 from './crew/crew-1.mjs';
import CREW_2 from './crew/crew-2.mjs';
import CREW_3 from './crew/crew-3.mjs';
import CREW_4 from './crew/crew-4.mjs';
import CREW_5 from './crew/crew-5.mjs';
import CREW_6 from './crew/crew-6.mjs';
import CREW_7 from './crew/crew-7.mjs';
import CREW_8 from './crew/crew-8.mjs';

/** A crew portrait ({ title, detail, body }) in the shape the pipeline consumes. */
const crewPlate = ({ title, detail, body }) => ({ title, focus: detail, draw: () => body });

export const AGENT_PLATES = Object.freeze([CREW_1, CREW_2, CREW_3, CREW_4, CREW_5, CREW_6, CREW_7, CREW_8].map(crewPlate));
