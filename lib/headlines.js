import { createRedditClient } from './reddit.js';

/** r/TheOnion is satire; r/nottheonion is real news that reads like satire. */
export const SOURCES = [
  { subreddit: 'nottheonion', isFake: false },
  { subreddit: 'TheOnion', isFake: true },
];

const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * In-memory pool of headlines, refreshed from Reddit on an interval.
 *
 * A refresh only replaces the pool when it actually produced headlines, so a
 * transient Reddit outage leaves the previous (playable) set in place rather
 * than emptying the game.
 */
export function createHeadlineStore({
  client = createRedditClient(),
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
  let timer = null;
  let lastLoadedAt = null;
  let lastError = null;

  async function load() {
    const next = [];
    const nextById = Object.create(null);
    const errors = [];

    const results = await Promise.allSettled(
      sources.map((source) => client.fetchTopPosts(source.subreddit, { limit })),
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
        if (nextById[post.id]) continue; // Crossposts can appear in both listings.
        const headline = { ...post, isFake };
        next.push(headline);
        nextById[post.id] = headline;
      }
    });

    lastError = errors.length ? errors.join('; ') : null;
    if (lastError) logger.error(`Headline refresh problems — ${lastError}`);

    if (next.length === 0) {
      logger.error('No headlines loaded; keeping the previously loaded set.');
      return headlines.length;
    }

    headlines = next;
    byId = nextById;
    lastLoadedAt = new Date();
    logger.log(`Loaded ${headlines.length} headlines from Reddit.`);
    return headlines.length;
  }

  return {
    load,

    /** Begin periodic refreshes. Does not keep the event loop alive. */
    start() {
      if (timer) return;
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

    get status() {
      return { size: headlines.length, lastLoadedAt, lastError };
    },
  };
}
