const EMPTY_SCORE = { correct: 0, total: 0, streak: 0, bestStreak: 0, lastHeadlineId: null };

function coerce(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** Read the session score, tolerating a missing or tampered-with session. */
export function readScore(session) {
  const stored = session?.score ?? {};
  const correct = coerce(stored.correct);
  const total = Math.max(coerce(stored.total), correct);
  return {
    correct,
    total,
    streak: coerce(stored.streak),
    bestStreak: Math.max(coerce(stored.bestStreak), coerce(stored.streak)),
    lastHeadlineId: typeof stored.lastHeadlineId === 'string' ? stored.lastHeadlineId : null,
    accuracy: total === 0 ? null : Math.round((correct / total) * 100),
  };
}

/**
 * Record a guess and return the updated score.
 *
 * Reloading the result page re-submits the same POST, so a repeat of the
 * headline just scored is treated as the same guess rather than a new one.
 */
export function recordGuess(session, { headlineId, correct }) {
  const current = readScore(session);
  if (current.lastHeadlineId === headlineId) return current;

  const streak = correct ? current.streak + 1 : 0;
  const next = {
    correct: current.correct + (correct ? 1 : 0),
    total: current.total + 1,
    streak,
    bestStreak: Math.max(current.bestStreak, streak),
    lastHeadlineId: headlineId,
  };
  if (session) session.score = next;
  return readScore({ score: next });
}

export function resetScore(session) {
  if (session) session.score = { ...EMPTY_SCORE };
  return readScore(null);
}
