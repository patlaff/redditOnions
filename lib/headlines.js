/** r/TheOnion is satire; r/nottheonion is real news that reads like satire. */
export const SOURCES = [
  { subreddit: 'nottheonion', isFake: false },
  { subreddit: 'TheOnion', isFake: true },
];

const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The pool of headlines the game draws from.
 *
 * The committed corpus is the floor: it is adopted synchronously at
 * construction, so the game is playable on the first request with no network
 * access at all. A live Reddit fetch, when one is configured, replaces the pool
 * with fresher headlines — and a failed fetch leaves whatever is already loaded
 * in place, so the worst case is stale content rather than an empty game.
 *
 * Pass no `client` (the default) for a corpus-only instance, which is the right
 * setup anywhere Reddit will not serve the request — notably AWS, whose IP
 * ranges Reddit blocks outright.
 */
export function createHeadlineStore({
  corpus = [],
  client = null,
  sources = SOURCES,
  limit = 100,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  logger = console,
  random = Math.random,
} = {}) {
  let headlines = [];
  // Null-prototype map so a headline ID like "__proto__" or "constructor" can
  // never resolve to an inherited Object property instead of a real headline.
  let byId = Object.create(null);
  let source = 'empty';
  let timer = null;
  let lastLoadedAt = null;
  let lastError = null;

  /** Swap in a new pool, rebuilding the id index alongside it. */
  function adopt(next, label) {
    headlines = next;
    byId = Object.create(null);
    for (const headline of next) byId[headline.id] = headline;
    source = label;
  }

  if (corpus.length > 0) adopt(corpus, 'corpus');

  async function load() {
    // Corpus-only: nothing to fetch, and the pool is already playable.
    if (!client) return headlines.length;

    const next = [];
    const seen = new Set();
    const errors = [];

    const results = await Promise.allSettled(
      sources.map(({ subreddit }) => client.fetchTopPosts(subreddit, { limit })),
    );

    results.forEach((result, index) => {
      const { subreddit, isFake } = sources[index];
      if (result.status === 'rejected') {
        // One subreddit failing must not take the whole refresh — or the
        // process — down.
        errors.push(`r/${subreddit}: ${result.reason?.message ?? result.reason}`);
        return;
      }
      for (const post of result.value) {
        if (seen.has(post.id)) continue; // Crossposts can appear in both listings.
        seen.add(post.id);
        next.push({ ...post, isFake });
      }
    });

    lastError = errors.length ? errors.join('; ') : null;
    if (lastError) logger.error(`Headline refresh problems — ${lastError}`);

    if (next.length === 0) {
      logger.error(`No headlines fetched; keeping the ${source} set of ${headlines.length}.`);
      return headlines.length;
    }

    adopt(next, 'live');
    lastLoadedAt = new Date();
    logger.log(`Loaded ${headlines.length} headlines from Reddit.`);
    return headlines.length;
  }

  return {
    load,

    /** Begin periodic refreshes. Does not keep the event loop alive. */
    start() {
      if (timer || !client) return;
      timer = setInterval(() => {
        load().catch((err) => logger.error('Headline refresh failed:', err));
      }, refreshIntervalMs);
      timer.unref?.();
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },

    /** A random headline, or null while the pool is still empty. */
    random() {
      if (headlines.length === 0) return null;
      return headlines[Math.floor(random() * headlines.length)];
    },

    get(id) {
      if (typeof id !== 'string') return null;
      return byId[id] ?? null;
    },

    get size() {
      return headlines.length;
    },

    /** Where the current pool came from: 'corpus', 'live', or 'empty'. */
    get source() {
      return source;
    },

    get status() {
      return { size: headlines.length, source, lastLoadedAt, lastError };
    },
  };
}
