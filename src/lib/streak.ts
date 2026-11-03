// Weekly pair streak: a week counts only if BOTH partners earned points in it.
// Weeks start on Monday (UTC).

export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

export function pairStreak(
  events: { user_id: string; created_at: string }[],
  userA: string,
  userB: string,
  now = new Date(),
): number {
  const weeks = new Map<string, Set<string>>();
  for (const e of events) {
    const w = weekStart(new Date(e.created_at));
    if (!weeks.has(w)) weeks.set(w, new Set());
    weeks.get(w)!.add(e.user_id);
  }
  const both = (w: string) => !!weeks.get(w)?.has(userA) && !!weeks.get(w)?.has(userB);

  let cursor = new Date(weekStart(now) + "T00:00:00Z");
  // The current week isn't over yet, so don't break the streak if it's still incomplete.
  if (!both(weekStart(cursor))) cursor = new Date(cursor.getTime() - 7 * 864e5);
  let streak = 0;
  while (both(weekStart(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 7 * 864e5);
  }
  return streak;
}
