import express from 'express';
import createError from 'http-errors';

import { readScore, recordGuess, resetScore } from '../lib/score.js';
import { titleCase } from '../lib/text.js';

/** The two buttons on the guess page, mapped to what they claim about the post. */
const GUESSES = new Map([
  ['real', { isFake: false }],
  ['fake', { isFake: true }],
]);

export function createRouter({ store }) {
  const router = express.Router();

  /** Show a random headline and ask the player to call it. */
  router.get('/', (req, res, next) => {
    const headline = store.random();
    if (!headline) {
      // `expose` because this one is an operational state worth telling the
      // player about, not an internal failure to hide behind a generic message.
      // With a corpus committed this should be unreachable — an empty pool means
      // the corpus failed to load, which the startup logs will show.
      return next(
        createError(503, 'No headlines are available right now. Try again in a moment.', {
          expose: true,
        }),
      );
    }
    res.render('guess', {
      title: 'Reddit Onions',
      headline: titleCase(headline.title),
      headlineId: headline.id,
      score: readScore(req.session),
    });
  });

  /** Reveal the answer for a guess. */
  router.post('/result/:headlineId', (req, res, next) => {
    const headline = store.get(req.params.headlineId);
    if (!headline) {
      return next(createError(404, 'That headline is no longer in the pool. Try another one.'));
    }

    const guess = GUESSES.get(String(req.body.guess).toLowerCase());
    if (!guess) {
      return next(createError(400, 'That is not a valid guess.'));
    }

    const correct = guess.isFake === headline.isFake;
    const score = recordGuess(req.session, { headlineId: headline.id, correct });

    res.render('result', {
      title: correct ? 'Correct! — Reddit Onions' : 'Nope — Reddit Onions',
      correct,
      verdict: correct ? 'Correct!' : 'Nope.',
      explanation: headline.isFake
        ? 'That one was satire, straight from The Onion.'
        : 'That one actually happened.',
      headline: titleCase(headline.title),
      subreddit: headline.subreddit,
      articleUrl: headline.articleUrl,
      redditUrl: headline.redditUrl,
      score,
    });
  });

  /** Clear the running score. */
  router.post('/reset', (req, res) => {
    resetScore(req.session);
    res.redirect('/');
  });

  /** Liveness probe for the load balancer, and a quick way to see refresh health. */
  router.get('/healthz', (req, res) => {
    const { size, source, lastLoadedAt, lastError } = store.status;
    res.status(size > 0 ? 200 : 503).json({
      status: size > 0 ? 'ok' : 'empty',
      headlines: size,
      // 'corpus' means live refreshes are off or have not succeeded yet — the
      // app is healthy either way, just serving committed headlines.
      source,
      lastLoadedAt,
      lastError,
    });
  });

  return router;
}

export default createRouter;
