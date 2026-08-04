#!/usr/bin/env node
import { createApp } from './app.js';
import { createHeadlineStore } from './lib/headlines.js';
import { createRedditClient } from './lib/reddit.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be a number between 0 and 65535, got "${process.env.PORT}".`);
  process.exit(1);
}

const client = createRedditClient();
if (!client.authenticated) {
  console.warn(
    'REDDIT_CLIENT_ID is not set; falling back to anonymous Reddit requests, ' +
      'which are heavily rate limited and often blocked from servers. See the README.',
  );
}

const store = createHeadlineStore({ client });

// Kick off the first load without blocking startup, so the process starts
// answering health checks (and serving the "still loading" page) right away.
store.load().catch((err) => console.error('Initial headline load failed:', err));
store.start();

const server = createApp({ store }).listen(port, () => {
  console.log(`Reddit Onions listening on http://localhost:${server.address().port}`);
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

// Elastic Beanstalk (and Docker, and Ctrl-C) stop the process with a signal;
// finish in-flight requests instead of dropping them.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down.`);
    store.stop();
    server.close(() => process.exit(0));
    // Don't hang forever on a stuck keep-alive connection.
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
