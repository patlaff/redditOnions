import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readScore, recordGuess, resetScore } from '../lib/score.js';

describe('score', () => {
  it('starts empty', () => {
    const score = readScore({});
    assert.deepEqual(score, {
      correct: 0,
      total: 0,
      streak: 0,
      bestStreak: 0,
      lastHeadlineId: null,
      accuracy: null,
    });
  });

  it('counts correct guesses and builds a streak', () => {
    const session = {};
    recordGuess(session, { headlineId: 'a', correct: true });
    recordGuess(session, { headlineId: 'b', correct: true });
    const score = recordGuess(session, { headlineId: 'c', correct: true });

    assert.equal(score.correct, 3);
    assert.equal(score.total, 3);
    assert.equal(score.streak, 3);
    assert.equal(score.bestStreak, 3);
    assert.equal(score.accuracy, 100);
  });

  it('resets the streak on a miss but remembers the best', () => {
    const session = {};
    recordGuess(session, { headlineId: 'a', correct: true });
    recordGuess(session, { headlineId: 'b', correct: true });
    const score = recordGuess(session, { headlineId: 'c', correct: false });

    assert.equal(score.streak, 0);
    assert.equal(score.bestStreak, 2);
    assert.equal(score.correct, 2);
    assert.equal(score.total, 3);
    assert.equal(score.accuracy, 67);
  });

  it('does not double-count a repeated submission of the same headline', () => {
    const session = {};
    recordGuess(session, { headlineId: 'a', correct: true });
    const score = recordGuess(session, { headlineId: 'a', correct: true });

    assert.equal(score.total, 1);
    assert.equal(score.correct, 1);
  });

  it('repairs a tampered-with session', () => {
    const score = readScore({ score: { correct: 99, total: -4, streak: 'x', bestStreak: 1 } });
    assert.equal(score.correct, 99);
    assert.equal(score.total, 99, 'total can never be below correct');
    assert.equal(score.streak, 0);
    assert.equal(score.bestStreak, 1);
  });

  it('clears everything on reset', () => {
    const session = {};
    recordGuess(session, { headlineId: 'a', correct: true });
    resetScore(session);

    assert.deepEqual(readScore(session), {
      correct: 0,
      total: 0,
      streak: 0,
      bestStreak: 0,
      lastHeadlineId: null,
      accuracy: null,
    });
  });

  it('tolerates a missing session', () => {
    const score = recordGuess(undefined, { headlineId: 'a', correct: true });
    assert.equal(score.correct, 1);
  });
});
