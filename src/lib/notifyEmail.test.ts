import { describe, expect, it } from "vitest";
import { buildEmails, type Pending } from "./notifyEmail";

const row = (p: Partial<Pending>): Pending => ({
  notification_id: 1, recipient_id: "dad", email: "dad@example.com", recipient_name: "Baba",
  actor_name: "Sara", kind: "lesson", ref_id: "L1", link_id: "L1", detail: "Bones of the hand", ...p,
});

describe("buildEmails", () => {
  it("writes one clear email for one lesson", () => {
    const [m] = buildEmails([row({})], "https://app.test/");
    expect(m.to).toBe("dad@example.com");
    expect(m.subject).toBe("Sara sent you a lesson: Bones of the hand");
    expect(m.text).toContain("https://app.test/lesson/L1");
    expect(m.text).toContain("https://app.test/me");
    expect(m.ids).toEqual([1]);
  });

  it("joins several things for one person into one email", () => {
    const mails = buildEmails([
      row({}),
      row({ notification_id: 2, kind: "challenge", ref_id: "C1", link_id: "C1", detail: "Fill the gap" }),
      row({ notification_id: 3, recipient_id: "sara", email: "sara@example.com", actor_name: "Baba",
            kind: "rating", ref_id: "A1", link_id: "C9", detail: "perfect" }),
    ], "https://app.test");
    expect(mails).toHaveLength(2);
    expect(mails[0].subject).toBe("Sara sent you 2 new things");
    expect(mails[0].ids).toEqual([1, 2]);
    expect(mails[1].subject).toBe("Baba rated your answer: Perfect ⭐");
    expect(mails[1].text).toContain("https://app.test/challenge/C9");
  });

  it("links a request to the teach screen and escapes HTML", () => {
    const [m] = buildEmails([row({ kind: "request", ref_id: "R1", link_id: "R1", detail: "<b>coffee</b> & tea" })], "https://app.test");
    expect(m.text).toContain("https://app.test/teach/new?request=R1");
    expect(m.html).toContain("&lt;b&gt;coffee&lt;/b&gt; &amp; tea");
    expect(m.html).not.toContain("<b>coffee</b>");
  });

  it("keeps Arabic text and marks it for either direction", () => {
    const [m] = buildEmails([row({ kind: "challenge", detail: "قل: صباح الخير" })], "https://app.test");
    expect(m.subject).toContain("قل: صباح الخير");
    expect(m.html).toContain('dir="auto"');
  });
});
