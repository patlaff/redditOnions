import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../app.js';

function post(id, subreddit, isFake, extra = {}) {
  return {
    id,
    title: `Headline ${id}`,
    subreddit,
    isFake,
    articleUrl: 'https://example.com/story',
    redditUrl: `https://www.reddit.com/r/${subreddit}/comments/${id}/`,
    ...extra,
  };
}

/** A headline store with a fixed pool, so responses are deterministic. */
function fakeStore(headlines) {
  const byId = Object.fromEntries(headlines.map((h) => [h.id, h]));
  return {
    random: () => headlines[0] ?? null,
    get: (id) => byId[id] ?? null,
    get status() {
      return {
        size: headlines.length,
        source: headlines.length ? 'corpus' : 'empty',
        lastLoadedAt: null,
        lastError: null,
      };
    },
  };
}

/** Minimal browser: keeps the session cookie and does not follow redirects. */
function createClient(baseUrl) {
  let cookie = null;
  return async function call(path, options = {}) {
    const headers = { ...options.headers };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(new URL(path, baseUrl), { ...options, headers, redirect: 'manual' });
    const setCookie = res.headers.getSetCookie();
    if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, headers: res.headers, body: await res.text() };
  };
}

function form(fields) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

const HEADLINES = [post('real1', 'nottheonion', false), post('fake1', 'TheOnion', true)];

// `isDevelopment` keeps the session cookie non-secure so the test client over
// plain http keeps a session, and surfaces stack traces if a handler throws.
const OPTIONS = { requestLogging: false, isDevelopment: true, sessionSecret: 'test-secret' };

/** Start an app on an ephemeral port and return a client for it. */
async function start(store, overrides = {}) {
  const server = createApp({ store, ...OPTIONS, ...overrides }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, request: createClient(`http://127.0.0.1:${server.address().port}`) };
}

/** The heading the error page renders, so assertions don't match a stack trace. */
function errorHeading(body) {
  return body.match(/<h1 class="verdict verdict--message">([^<]*)<\/h1>/)?.[1];
}

describe('the app', () => {
  let server;
  let request;

  before(async () => {
    ({ server, request } = await start(fakeStore(HEADLINES)));
  });

  after(() => server.close());

  it('serves the guess page with both choices', async () => {
    const res = await request('/');

    assert.equal(res.status, 200);
    assert.match(res.body, /Headline Real1/);
    assert.match(res.body, /value="real"/);
    assert.match(res.body, /value="fake"/);
    assert.match(res.body, /action="\/result\/real1"/);
  });

  it('sends a strict content security policy and hides the server stack', async () => {
    const res = await request('/');

    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('confirms a correct guess and counts it', async () => {
    const res = await request('/result/fake1', form({ guess: 'fake' }));

    assert.equal(res.status, 200);
    assert.match(res.body, /Correct!/);
    assert.match(res.body, /straight from The Onion/);
    assert.match(res.body, /r\/TheOnion/);
  });

  it('carries the score across requests', async () => {
    const res = await request('/');
    assert.match(res.body, /<dd>1<span class="stat__of">\/1<\/span><\/dd>/);
  });

  it('rejects a wrong guess and breaks the streak', async () => {
    const res = await request('/result/real1', form({ guess: 'fake' }));

    assert.equal(res.status, 200);
    assert.match(res.body, /Nope\./);
    assert.match(res.body, /actually happened/);
    assert.match(res.body, /<dd>1<span class="stat__of">\/2<\/span><\/dd>/);
  });

  it('does not count a resubmitted result twice', async () => {
    await request('/result/real1', form({ guess: 'fake' }));
    const res = await request('/');

    assert.match(res.body, /<dd>1<span class="stat__of">\/2<\/span><\/dd>/);
  });

  it('clears the score on reset', async () => {
    const reset = await request('/reset', form({}));
    assert.equal(reset.status, 302);
    assert.equal(reset.headers.get('location'), '/');

    const res = await request('/');
    assert.match(res.body, /<dd>0<span class="stat__of">\/0<\/span><\/dd>/);
  });

  it('rejects an unknown headline', async () => {
    const res = await request('/result/nope', form({ guess: 'real' }));

    assert.equal(res.status, 404);
    assert.match(res.body, /no longer in the pool/);
  });

  it('rejects an invalid guess', async () => {
    const res = await request('/result/real1', form({ guess: 'maybe' }));

    assert.equal(res.status, 400);
    assert.match(res.body, /not a valid guess/);
  });

  it('renders a friendly 404 for unknown pages', async () => {
    const res = await request('/does-not-exist');

    assert.equal(res.status, 404);
    assert.match(res.body, /does not exist/);
    assert.match(res.body, /Back to the game/);
  });

  it('reports health', async () => {
    const res = await request('/healthz');

    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), {
      status: 'ok',
      headlines: 2,
      source: 'corpus',
      lastLoadedAt: null,
      lastError: null,
    });
  });

  it('escapes headline markup', async () => {
    const store = fakeStore([post('xss', 'TheOnion', true, { title: '<script>alert(1)</script>' })]);
    const hostile = await start(store);

    const res = await hostile.request('/');
    hostile.server.close();

    assert.doesNotMatch(res.body, /<script>alert/i);
    assert.match(res.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/i);
  });

  it('explains itself while the pool is still empty', async () => {
    const empty = await start(fakeStore([]));

    const page = await empty.request('/');
    const health = await empty.request('/healthz');
    empty.server.close();

    assert.equal(page.status, 503);
    assert.equal(
      errorHeading(page.body),
      'No headlines are available right now. Try again in a moment.',
    );
    assert.equal(health.status, 503);
    assert.match(health.body, /"status":"empty"/);
  });

  it('hides internal failures behind a generic message', async () => {
    const exploding = await start(
      {
        random() {
          throw new Error('secret internal detail');
        },
        get: () => null,
        get status() {
          return { size: 1, lastLoadedAt: null, lastError: null };
        },
      },
      { isDevelopment: false },
    );

    const res = await exploding.request('/');
    exploding.server.close();

    assert.equal(res.status, 500);
    assert.equal(errorHeading(res.body), 'Something went wrong on our end.');
    assert.doesNotMatch(res.body, /secret internal detail/);
  });
});
