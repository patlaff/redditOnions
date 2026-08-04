import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createHeadlineStore } from '../lib/headlines.js';

const quietLogger = { log() {}, error() {}, warn() {} };

function post(id, subreddit) {
  return { id, title: `Headline ${id}`, subreddit, articleUrl: null, redditUrl: null };
}

/** A corpus entry, which unlike a fetched post already carries its isFake tag. */
function stored(id, isFake = false) {
  return { ...post(id, isFake ? 'TheOnion' : 'nottheonion'), isFake };
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
    assert.equal(store.status.source, 'empty');
    assert.equal(store.status.lastLoadedAt, null);
  });

  it('is playable from the corpus before any load runs', () => {
    const store = createHeadlineStore({
      corpus: [stored('c1'), stored('c2', true)],
      client: stubClient({}),
      logger: quietLogger,
    });

    assert.equal(store.size, 2);
    assert.equal(store.source, 'corpus');
    assert.equal(store.get('c2').isFake, true);
    assert.ok(store.random());
  });

  it('replaces the corpus once a live fetch succeeds', async () => {
    const store = createHeadlineStore({
      corpus: [stored('c1')],
      client: stubClient({ nottheonion: [post('live', 'nottheonion')] }),
      logger: quietLogger,
    });

    await store.load();

    assert.equal(store.source, 'live');
    assert.equal(store.get('live').isFake, false);
    assert.equal(store.get('c1'), null, 'the stale corpus entry is gone');
  });

  it('falls back to the corpus when every live fetch fails', async () => {
    const store = createHeadlineStore({
      corpus: [stored('c1')],
      client: stubClient({
        nottheonion: new Error('HTTP 403'),
        TheOnion: new Error('HTTP 403'),
      }),
      logger: quietLogger,
    });

    await store.load();

    assert.equal(store.size, 1);
    assert.equal(store.source, 'corpus');
    assert.equal(store.get('c1').id, 'c1');
    assert.match(store.status.lastError, /403/);
  });

  it('never touches the network without a client', async () => {
    const store = createHeadlineStore({
      corpus: [stored('c1')],
      logger: quietLogger,
      refreshIntervalMs: 5,
    });

    assert.equal(await store.load(), 1);
    // start() must be a no-op too, or a corpus-only deploy would schedule a
    // timer that can only ever fail.
    store.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    store.stop();

    assert.equal(store.source, 'corpus');
    assert.equal(store.status.lastError, null);
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
