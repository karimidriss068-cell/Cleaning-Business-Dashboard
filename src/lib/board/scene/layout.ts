// Seat positions around the table, as percentages of the scene. The chair sits at the head (top
// centre); advisors are spread evenly around the rest of the ellipse, clockwise from the chair.

export type Seat = { x: number; y: number };

export const CHAIR_SEAT: Seat = { x: 50, y: 14 };
const CENTER = { x: 50, y: 54 };
const RADIUS = { x: 41, y: 33 };

export function seatPositions(advisorCount: number): Seat[] {
  const total = advisorCount + 1;
  return Array.from({ length: advisorCount }, (_, i) => {
    const angle = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / total;
    return { x: round(CENTER.x + RADIUS.x * Math.cos(angle)), y: round(CENTER.y + RADIUS.y * Math.sin(angle)) };
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Seats on an ellipse, clockwise from the chair at the top, in the unit of the given centre and radii
 * (percent of the scene, or SVG units). Used by the ring and orbit styles.
 */
export function ringPositions(advisorCount: number, center: Seat, radius: Seat): Seat[] {
  const total = advisorCount + 1;
  return Array.from({ length: advisorCount }, (_, i) => {
    const angle = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / total;
    return { x: round(center.x + radius.x * Math.cos(angle)), y: round(center.y + radius.y * Math.sin(angle)) };
  });
}
