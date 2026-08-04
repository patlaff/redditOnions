/**
 * The committed headline corpus.
 *
 * Reddit's API now requires per-app approval, and Reddit separately blocks
 * requests from AWS IP ranges, so a deployed instance can reach neither the
 * authenticated nor the anonymous endpoints. The corpus is the answer: a file of
 * headlines checked into the repo, loaded at startup, so the game is playable
 * with no network access at all. Live fetching, when it is available, layers on
 * top (see lib/headlines.js).
 *
 * Refresh it with `npm run refresh-headlines` from a machine Reddit will talk to.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { safeLink } from './reddit.js';

export const DEFAULT_CORPUS_PATH = path.join(import.meta.dirname, '..', 'data', 'headlines.json');

/**
 * Validate one raw corpus entry into a headline the game can render.
 *
 * The corpus is hand-editable, so treat it as untrusted input rather than
 * assuming the refresh script wrote every entry: a bad record is dropped, not
 * rendered as `undefined` or passed through into an href.
 */
export function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const { id, title, subreddit, isFake, articleUrl, redditUrl } = entry;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (typeof subreddit !== 'string' || subreddit === '') return null;
  // Deliberately strict: a missing or misspelled flag would silently make a
  // headline unwinnable, which looks like a broken game rather than bad data.
  if (typeof isFake !== 'boolean') return null;

  return {
    id,
    title,
    subreddit,
    isFake,
    articleUrl: safeLink(articleUrl),
    redditUrl: safeLink(redditUrl),
  };
}

/**
 * Parse corpus JSON into `{ generatedAt, headlines }`.
 *
 * @throws {Error} if the text is not JSON, or has no `headlines` array.
 */
export function parseCorpus(text) {
  const payload = JSON.parse(text);
  if (!Array.isArray(payload?.headlines)) {
    throw new Error('Corpus is missing a "headlines" array.');
  }

  const headlines = [];
  const seen = new Set();
  for (const entry of payload.headlines) {
    const headline = normalizeEntry(entry);
    if (!headline || seen.has(headline.id)) continue;
    seen.add(headline.id);
    headlines.push(headline);
  }

  return {
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : null,
    headlines,
  };
}

/**
 * Read and parse the corpus from disk.
 *
 * Never throws: the corpus is the app's floor, so a missing or corrupt file
 * degrades to an empty pool (and a logged error) rather than stopping startup.
 */
export async function loadCorpus({ file = DEFAULT_CORPUS_PATH, logger = console } = {}) {
  try {
    return parseCorpus(await readFile(file, 'utf8'));
  } catch (err) {
    logger.error(`Could not load the headline corpus from ${file}: ${err.message}`);
    return { generatedAt: null, headlines: [] };
  }
}
