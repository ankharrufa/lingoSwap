// Spaced repetition with simple "Leitner boxes".
// A card starts in box 1. A correct answer moves it up one box, so it comes back later.
// A wrong answer sends it back to box 1, so it comes back tomorrow.
// Box 4 or higher counts as "mastered".

export const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32]; // index = box (1..6)
export const MAX_BOX = 6;
export const MASTERED_BOX = 4;

export type CardState = { box: number; reps: number; lapses: number };

export function review(card: CardState, correct: boolean, now = new Date()) {
  const box = correct ? Math.min(card.box + 1, MAX_BOX) : 1;
  const due = new Date(now.getTime() + INTERVAL_DAYS[box] * 24 * 60 * 60 * 1000);
  return {
    box,
    reps: card.reps + 1,
    lapses: card.lapses + (correct ? 0 : 1),
    due_at: due.toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}
