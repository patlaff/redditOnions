import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createHeadlineStore } from '../lib/headlines.js';

const quietLogger = { log() {}, error() {}, warn() {} };

function post(id, subreddit) {
  return { id, title: `Headline ${id}`, subreddit, articleUrl: null, redditUrl: null };
}

/** A client whose responses are keyed by subreddit; an Error value is thrown. */
function stubClient(bySubreddit) {
  return {
    authenticated: true,
    async fetchTopPosts(subreddit) {
      const result = bySubreddit[subreddit];
      if (result instanceof Error) throw result;
      return result ?? [];
    },
  };
}

describe('createHeadlineStore', () => {
  it('tags each headline with whether its subreddit is satire', async () => {
    const store = createHeadlineStore({
      client: stubClient({
        nottheonion: [post('a', 'nottheonion')],
        TheOnion: [post('b', 'TheOnion')],
      }),
      logger: quietLogger,
    });

    await store.load();

    assert.equal(store.size, 2);
    assert.equal(store.get('a').isFake, false);
    assert.equal(store.get('b').isFake, true);
  });

  it('keeps one copy of a post that appears in both listings', async () => {
    const store = createHeadlineStore({
      client: stubClient({
        nottheonion: [post('dup', 'nottheonion')],
        TheOnion: [post('dup', 'TheOnion')],
      }),
      logger: quietLogger,
    });

    await store.load();
    assert.equal(store.size, 1);
  });

  it('still loads when one subreddit fails', async () => {
    const store = createHeadlineStore({
      client: stubClient({
        nottheonion: [post('a', 'nottheonion')],
        TheOnion: new Error('HTTP 403'),
      }),
      logger: quietLogger,
    });

    await store.load();

    assert.equal(store.size, 1);
    assert.match(store.status.lastError, /TheOnion.*403/);
  });

  it('keeps the previous set when a refresh returns nothing', async () => {
    let responses = { nottheonion: [post('a', 'nottheonion')], TheOnion: [] };
    const store = createHeadlineStore({
      client: {
        authenticated: true,
        async fetchTopPosts(subreddit) {
          const result = responses[subreddit];
          if (result instanceof Error) throw result;
          return result;
        },
      },
      logger: quietLogger,
    });

    await store.load();
    assert.equal(store.size, 1);

    responses = { nottheonion: new Error('down'), TheOnion: new Error('down') };
    await store.load();

    assert.equal(store.size, 1, 'the playable set survives an outage');
    assert.equal(store.get('a').id, 'a');
  });

  it('reports an empty pool before the first load', () => {
    const store = createHeadlineStore({ client: stubClient({}), logger: quietLogger });

    assert.equal(store.random(), null);
    assert.equal(store.size, 0);
    assert.equal(store.status.lastLoadedAt, null);
  });

  it('picks headlines with the injected random source', async () => {
    const store = createHeadlineStore({
      client: stubClient({
        nottheonion: [post('a', 'nottheonion'), post('b', 'nottheonion')],
        TheOnion: [post('c', 'TheOnion')],
      }),
      logger: quietLogger,
      random: () => 0.99,
    });

    await store.load();
    assert.equal(store.random().id, 'c');
  });

  it('never resolves an id to an inherited Object property', async () => {
    const store = createHeadlineStore({
      client: stubClient({ nottheonion: [post('a', 'nottheonion')] }),
      logger: quietLogger,
    });

    await store.load();
    assert.equal(store.get('__proto__'), null);
    assert.equal(store.get('constructor'), null);
    assert.equal(store.get(42), null);
  });

  it('starts and stops the refresh timer without leaking it', async () => {
    const store = createHeadlineStore({
      client: stubClient({ nottheonion: [post('a', 'nottheonion')] }),
      logger: quietLogger,
      refreshIntervalMs: 10,
    });

    store.start();
    store.start(); // Idempotent.
    await new Promise((resolve) => setTimeout(resolve, 30));
    store.stop();

    assert.ok(store.size >= 1);
  });
});
