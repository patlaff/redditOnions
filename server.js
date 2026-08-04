#!/usr/bin/env node
import { createApp } from './app.js';
import { loadCorpus } from './lib/corpus.js';
import { createHeadlineStore } from './lib/headlines.js';
import { createRedditClient } from './lib/reddit.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be a number between 0 and 65535, got "${process.env.PORT}".`);
  process.exit(1);
}

/**
 * Live Reddit fetching is opt-in, and off by default, because neither path is
 * dependable: OAuth credentials now require per-app approval from Reddit, and
 * the keyless endpoints — which need no approval — are blocked outright from
 * many hosting providers' IP ranges. Unset, the app serves the committed corpus
 * and needs no network access at all.
 */
function createLiveClient() {
  if (process.env.REDDIT_CLIENT_ID) {
    console.log('REDDIT_CLIENT_ID is set; refreshing headlines from Reddit over OAuth.');
    return createRedditClient();
  }
  if (process.env.REDDIT_ANONYMOUS === '1') {
    console.warn(
      'REDDIT_ANONYMOUS=1; using unauthenticated Reddit requests. These are rate ' +
        'limited, and blocked from many hosting providers — check /healthz to ' +
        'see whether refreshes are actually landing.',
    );
    return createRedditClient();
  }
  return null;
}

const corpus = await loadCorpus();
console.log(
  `Loaded ${corpus.headlines.length} headlines from the corpus` +
    `${corpus.generatedAt ? ` (generated ${corpus.generatedAt})` : ''}.`,
);

const client = createLiveClient();
const store = createHeadlineStore({ corpus: corpus.headlines, client });

if (store.size === 0 && !client) {
  console.error(
    'The headline corpus is empty and live fetching is off, so there is nothing to ' +
      'play. Run `npm run refresh-headlines` and commit data/headlines.json.',
  );
}

// Kick off the first refresh without blocking startup: the corpus already makes
// the app playable, so a slow or failing fetch costs freshness, not uptime.
store.load().catch((err) => console.error('Initial headline load failed:', err));
store.start();

const server = createApp({ store }).listen(port, () => {
  console.log(`Onion or Not listening on http://localhost:${server.address().port}`);
});

server.on('error', (error) => {
  if (error.syscall !== 'listen') throw error;
  if (error.code === 'EACCES') {
    console.error(`Port ${port} requires elevated privileges.`);
    process.exit(1);
  }
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use.`);
    process.exit(1);
  }
  throw error;
});

// Docker (and Ctrl-C) stop the process with a signal; finish in-flight requests
// instead of dropping them.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down.`);
    store.stop();
    server.close(() => process.exit(0));
    // Don't hang forever on a stuck keep-alive connection.
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
