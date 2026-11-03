// Builds a multiple-choice quiz from items the teacher already taught. No AI:
// the wrong answers are simply other items from the same pool.

export type QuizSource = { id: string; term: string; translation: string };
export type QuizQuestion = {
  item_id: string;
  q: string;          // what the learner sees
  options: string[];  // possible answers
  answer: number;     // index of the right option
  direction: "term_to_translation" | "translation_to_term";
};

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param chosen items to ask about
 * @param pool   all items available for wrong answers (should include `chosen`)
 * @param maxOptions options per question (2..4); fewer if the pool is small
 */
export function buildQuiz(
  chosen: QuizSource[],
  pool: QuizSource[],
  { maxOptions = 4, rand = Math.random } = {},
): QuizQuestion[] {
  const usable = (s: QuizSource) => s.term.trim() && s.translation.trim();
  const all = pool.filter(usable);
  return shuffle(chosen.filter(usable), rand).map((item, idx) => {
    const direction = idx % 2 === 0 ? "term_to_translation" : "translation_to_term";
    const ask = direction === "term_to_translation" ? item.term : item.translation;
    const pick = (s: QuizSource) => (direction === "term_to_translation" ? s.translation : s.term);
    const right = pick(item);
    const wrong = [...new Set(all.filter((s) => s.id !== item.id).map(pick))].filter((w) => w !== right);
    const options = shuffle([right, ...shuffle(wrong, rand).slice(0, maxOptions - 1)], rand);
    return { item_id: item.id, q: ask, options, answer: options.indexOf(right), direction };
  });
}

export function scoreQuiz(questions: QuizQuestion[], picks: number[]): number {
  if (questions.length === 0) return 0;
  const right = questions.filter((q, i) => picks[i] === q.answer).length;
  return right / questions.length;
}
