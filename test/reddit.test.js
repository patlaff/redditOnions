import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRedditClient, safeLink } from '../lib/reddit.js';

/** Build a fetch stand-in that replays canned responses and records calls. */
function stubFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, options) => {
    calls.push({ url, options });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request to ${url}`);
    return {
      ok: next.status === undefined || (next.status >= 200 && next.status < 300),
      status: next.status ?? 200,
      json: async () => next.body,
    };
  };
  impl.calls = calls;
  return impl;
}

function listing(...posts) {
  return { data: { children: posts.map((data) => ({ data })) } };
}

const POST = {
  id: 'abc123',
  title: 'Man bites dog',
  subreddit: 'nottheonion',
  url: 'https://example.com/story',
  permalink: '/r/nottheonion/comments/abc123/man_bites_dog/',
};

const TOKEN = { body: { access_token: 'tok-1', expires_in: 3600 } };

describe('createRedditClient', () => {
  it('uses the public endpoint without credentials', async () => {
    const fetchImpl = stubFetch([{ body: listing(POST) }]);
    const client = createRedditClient({ clientId: undefined, fetchImpl });

    assert.equal(client.authenticated, false);
    const posts = await client.fetchTopPosts('nottheonion');

    assert.equal(fetchImpl.calls.length, 1, 'no token request is made');
    const { url, options } = fetchImpl.calls[0];
    assert.match(url, /^https:\/\/www\.reddit\.com\/r\/nottheonion\/top\.json\?/);
    assert.match(url, /raw_json=1/);
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(posts, [
      {
        id: 'abc123',
        title: 'Man bites dog',
        subreddit: 'nottheonion',
        articleUrl: 'https://example.com/story',
        redditUrl: 'https://www.reddit.com/r/nottheonion/comments/abc123/man_bites_dog/',
      },
    ]);
  });

  it('authenticates with client credentials and calls the OAuth host', async () => {
    const fetchImpl = stubFetch([TOKEN, { body: listing(POST) }]);
    const client = createRedditClient({
      clientId: 'id',
      clientSecret: 'secret',
      userAgent: 'test-agent',
      fetchImpl,
    });

    assert.equal(client.authenticated, true);
    await client.fetchTopPosts('TheOnion');

    const [token, listingCall] = fetchImpl.calls;
    assert.equal(token.url, 'https://www.reddit.com/api/v1/access_token');
    assert.equal(token.options.method, 'POST');
    assert.equal(
      token.options.headers.Authorization,
      `Basic ${Buffer.from('id:secret').toString('base64')}`,
    );
    assert.equal(token.options.body.get('grant_type'), 'client_credentials');
    assert.equal(token.options.headers['User-Agent'], 'test-agent');

    assert.match(listingCall.url, /^https:\/\/oauth\.reddit\.com\/r\/TheOnion\/top\?/);
    assert.equal(listingCall.options.headers.Authorization, 'Bearer tok-1');
  });

  it('uses the installed-app grant when there is no secret', async () => {
    const fetchImpl = stubFetch([TOKEN, { body: listing(POST) }]);
    const client = createRedditClient({ clientId: 'id', clientSecret: undefined, fetchImpl });

    await client.fetchTopPosts('TheOnion');

    const grant = fetchImpl.calls[0].options.body.get('grant_type');
    assert.equal(grant, 'https://oauth.reddit.com/grants/installed_client');
  });

  it('reuses a cached token until it expires', async () => {
    const fetchImpl = stubFetch([
      { body: { access_token: 'tok-1', expires_in: 120 } },
      { body: listing(POST) },
      { body: listing(POST) },
      { body: { access_token: 'tok-2', expires_in: 120 } },
      { body: listing(POST) },
    ]);
    let clock = 0;
    const client = createRedditClient({
      clientId: 'id',
      clientSecret: 'secret',
      fetchImpl,
      now: () => clock,
    });

    await client.fetchTopPosts('TheOnion');
    await client.fetchTopPosts('TheOnion');
    assert.equal(fetchImpl.calls.length, 3, 'second listing reuses the token');

    clock += 120_000; // Past the 60s-skewed expiry.
    await client.fetchTopPosts('TheOnion');
    assert.equal(fetchImpl.calls.length, 5);
    assert.equal(fetchImpl.calls[4].options.headers.Authorization, 'Bearer tok-2');
  });

  it('requests only one token for concurrent callers', async () => {
    const fetchImpl = stubFetch([TOKEN, { body: listing(POST) }, { body: listing(POST) }]);
    const client = createRedditClient({ clientId: 'id', clientSecret: 'secret', fetchImpl });

    await Promise.all([client.fetchTopPosts('TheOnion'), client.fetchTopPosts('nottheonion')]);

    const tokenRequests = fetchImpl.calls.filter((c) => c.url.includes('access_token'));
    assert.equal(tokenRequests.length, 1);
  });

  it('refreshes once after a 401 and retries the listing', async () => {
    const fetchImpl = stubFetch([
      TOKEN,
      { status: 401, body: {} },
      { body: { access_token: 'tok-2', expires_in: 3600 } },
      { body: listing(POST) },
    ]);
    const client = createRedditClient({ clientId: 'id', clientSecret: 'secret', fetchImpl });

    const posts = await client.fetchTopPosts('TheOnion');

    assert.equal(posts.length, 1);
    assert.equal(fetchImpl.calls.at(-1).options.headers.Authorization, 'Bearer tok-2');
  });

  it('gives up after a second 401', async () => {
    const fetchImpl = stubFetch([
      TOKEN,
      { status: 401, body: {} },
      { body: { access_token: 'tok-2', expires_in: 3600 } },
      { status: 401, body: {} },
    ]);
    const client = createRedditClient({ clientId: 'id', clientSecret: 'secret', fetchImpl });

    await assert.rejects(client.fetchTopPosts('TheOnion'), { name: 'RedditError', status: 401 });
  });

  it('reports the status when Reddit rejects the request', async () => {
    const fetchImpl = stubFetch([{ status: 403, body: {} }]);
    const client = createRedditClient({ clientId: undefined, fetchImpl });

    await assert.rejects(client.fetchTopPosts('TheOnion'), {
      name: 'RedditError',
      status: 403,
      message: /HTTP 403/,
    });
  });

  it('rejects a token response without an access_token', async () => {
    const fetchImpl = stubFetch([{ body: { error: 'nope' } }]);
    const client = createRedditClient({ clientId: 'id', clientSecret: 'secret', fetchImpl });

    await assert.rejects(client.fetchTopPosts('TheOnion'), { name: 'RedditError' });
  });

  it('drops posts that are missing fields the game renders', async () => {
    const fetchImpl = stubFetch([
      {
        body: listing(
          POST,
          { id: 'x', subreddit: 'TheOnion' }, // no title
          { title: 'No id', subreddit: 'TheOnion' },
          null,
        ),
      },
    ]);
    const client = createRedditClient({ clientId: undefined, fetchImpl });

    const posts = await client.fetchTopPosts('TheOnion');
    assert.deepEqual(
      posts.map((p) => p.id),
      ['abc123'],
    );
  });

  it('drops link schemes the browser would execute', async () => {
    const fetchImpl = stubFetch([
      { body: listing({ ...POST, url: 'javascript:alert(1)', permalink: 42 }) },
    ]);
    const client = createRedditClient({ clientId: undefined, fetchImpl });

    const [post] = await client.fetchTopPosts('TheOnion');
    assert.equal(post.articleUrl, null);
    assert.equal(post.redditUrl, null);
  });

  it('tolerates a listing with no children', async () => {
    const fetchImpl = stubFetch([{ body: { error: 'private subreddit' } }]);
    const client = createRedditClient({ clientId: undefined, fetchImpl });

    assert.deepEqual(await client.fetchTopPosts('TheOnion'), []);
  });
});

describe('safeLink', () => {
  it('passes http and https through', () => {
    assert.equal(safeLink('https://example.com/a'), 'https://example.com/a');
    assert.equal(safeLink('http://example.com/a'), 'http://example.com/a');
  });

  it('rejects other schemes and junk', () => {
    assert.equal(safeLink('javascript:alert(1)'), null);
    assert.equal(safeLink('data:text/html,hi'), null);
    assert.equal(safeLink('not a url'), null);
    assert.equal(safeLink(undefined), null);
  });
});
