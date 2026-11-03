import { describe, expect, it } from "vitest";
import { answersMatch, isRtl, normalizeAnswer } from "./normalize";
import { buildQuiz, scoreQuiz } from "./quiz";
import { review } from "./srs";
import { pairStreak, weekStart } from "./streak";

describe("normalizeAnswer", () => {
  it("ignores case, spaces, punctuation and Latin accents", () => {
    expect(answersMatch("  Café!! ", "cafe")).toBe(true);
    expect(answersMatch("the  Scaphoid.", "The scaphoid")).toBe(true);
  });
  it("ignores Arabic harakat, tatweel and letter variants", () => {
    expect(answersMatch("مَرْحَبًا", "مرحبا")).toBe(true);
    expect(answersMatch("صبـــاح", "صباح")).toBe(true);
    expect(answersMatch("أحمد", "احمد")).toBe(true);
    expect(answersMatch("إسلام", "اسلام")).toBe(true);
    expect(answersMatch("مدرسة", "مدرسه")).toBe(true);
    expect(answersMatch("على", "علي")).toBe(true);
  });
  it("still tells different words apart", () => {
    expect(answersMatch("lunate", "scaphoid")).toBe(false);
    expect(answersMatch("", "")).toBe(false);
    expect(normalizeAnswer("كتب")).not.toBe(normalizeAnswer("كلب"));
  });
  it("detects right-to-left text", () => {
    expect(isRtl("صباح الخير")).toBe(true);
    expect(isRtl("Good morning")).toBe(false);
    expect(isRtl("Scaphoid عظم")).toBe(false);
  });
});

describe("srs.review", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  it("moves up on a correct answer and resets on a wrong one", () => {
    const up = review({ box: 2, reps: 3, lapses: 0 }, true, now);
    expect(up.box).toBe(3);
    expect(up.due_at).toBe("2026-11-07T12:00:00.000Z");
    const down = review({ box: 5, reps: 3, lapses: 1 }, false, now);
    expect(down).toMatchObject({ box: 1, lapses: 2, reps: 4, due_at: "2026-11-04T12:00:00.000Z" });
  });
  it("never goes above the top box", () => {
    expect(review({ box: 6, reps: 0, lapses: 0 }, true, now).box).toBe(6);
  });
});

describe("buildQuiz", () => {
  const items = [
    { id: "1", term: "Scaphoid", translation: "زورقي" },
    { id: "2", term: "Lunate", translation: "هلالي" },
    { id: "3", term: "Phalanx", translation: "سلامية" },
    { id: "4", term: "Radius", translation: "كعبرة" },
    { id: "5", term: "Ulna", translation: "زند" },
  ];
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  it("makes one question per item with the right answer among the options", () => {
    const qs = buildQuiz(items.slice(0, 3), items, { rand });
    expect(qs).toHaveLength(3);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      const item = items.find((i) => i.id === q.item_id)!;
      const right = q.direction === "term_to_translation" ? item.translation : item.term;
      expect(q.options[q.answer]).toBe(right);
    }
  });
  it("uses fewer options when the pool is small", () => {
    const qs = buildQuiz(items.slice(0, 2), items.slice(0, 2), { rand });
    expect(qs.every((q) => q.options.length === 2)).toBe(true);
  });
  it("scores answers", () => {
    const qs = buildQuiz(items, items, { rand });
    expect(scoreQuiz(qs, qs.map((q) => q.answer))).toBe(1);
    expect(scoreQuiz(qs, qs.map(() => -1))).toBe(0);
  });
});

describe("pairStreak", () => {
  const A = "a", B = "b";
  const now = new Date("2026-11-04T10:00:00Z"); // a Wednesday
  it("counts weeks where both partners played", () => {
    expect(weekStart(now)).toBe("2026-11-02");
    const ev = [
      { user_id: A, created_at: "2026-11-02T09:00:00Z" }, // this week, only A so far
      { user_id: A, created_at: "2026-10-27T09:00:00Z" },
      { user_id: B, created_at: "2026-10-30T09:00:00Z" },
      { user_id: A, created_at: "2026-10-20T09:00:00Z" },
      { user_id: B, created_at: "2026-10-25T09:00:00Z" },
      { user_id: A, created_at: "2026-10-13T09:00:00Z" }, // only A: streak stops here
    ];
    expect(pairStreak(ev, A, B, now)).toBe(2);
    expect(pairStreak([...ev, { user_id: B, created_at: "2026-11-03T09:00:00Z" }], A, B, now)).toBe(3);
  });
});
