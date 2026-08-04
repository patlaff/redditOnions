/**
 * Minimal Reddit API client.
 *
 * Reddit throttles (and increasingly rejects outright) anonymous requests from
 * server IPs, so the client authenticates with app-only OAuth when credentials
 * are configured and falls back to the public .json endpoints when they are not.
 * Both paths return the same normalized shape.
 */

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const OAUTH_BASE = 'https://oauth.reddit.com';
const PUBLIC_BASE = 'https://www.reddit.com';

// Refresh slightly before the token actually expires so an in-flight request
// never races the expiry.
const EXPIRY_SKEW_MS = 60 * 1000;

// Reddit asks that every client send a descriptive User-Agent, and rate limits
// generic ones far more aggressively.
export const DEFAULT_USER_AGENT = 'web:onionornot:v1.0 (by /u/patlaff)';

export class RedditError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'RedditError';
    this.status = status;
  }
}

/**
 * Turn a Reddit listing child into the only fields the game needs. Anything
 * missing a field we render is dropped rather than rendered as `undefined`.
 */
function normalizePost(child) {
  const data = child?.data;
  if (!data) return null;
  const { id, title, subreddit, url, permalink } = data;
  if (typeof id !== 'string' || typeof title !== 'string' || typeof subreddit !== 'string') {
    return null;
  }
  return {
    id,
    title,
    subreddit,
    articleUrl: safeLink(url),
    redditUrl: typeof permalink === 'string' ? safeLink(`${PUBLIC_BASE}${permalink}`) : null,
  };
}

/**
 * Reddit is the source of these URLs, but never emit a scheme the browser will
 * execute (javascript:, data:) into an href.
 */
export function safeLink(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function createRedditClient({
  clientId = process.env.REDDIT_CLIENT_ID,
  clientSecret = process.env.REDDIT_CLIENT_SECRET,
  userAgent = process.env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT,
  timeoutMs = 10_000,
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  const authenticated = Boolean(clientId);

  let token = null;
  let tokenExpiresAt = 0;
  // Concurrent refreshes would each burn a request against the same rate limit,
  // so callers share one in-flight token request.
  let pendingToken = null;

  function request(url, options) {
    return fetchImpl(url, {
      ...options,
      redirect: 'error', // Reddit answers directly; never chase a redirect elsewhere.
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  async function requestToken() {
    // An "installed app" has no secret and uses the anonymous device grant; a
    // "web app" / "script" authenticates with its secret.
    const body = new URLSearchParams(
      clientSecret
        ? { grant_type: 'client_credentials' }
        : {
            grant_type: 'https://oauth.reddit.com/grants/installed_client',
            device_id: 'DO_NOT_TRACK_THIS_DEVICE',
          },
    );
    const basic = Buffer.from(`${clientId}:${clientSecret ?? ''}`).toString('base64');

    const res = await request(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      body,
    });

    if (!res.ok) {
      throw new RedditError(`Reddit token request failed with HTTP ${res.status}`, {
        status: res.status,
      });
    }

    const payload = await res.json();
    if (!payload || typeof payload.access_token !== 'string') {
      throw new RedditError('Reddit token response did not include an access_token');
    }

    const lifetimeMs = (Number(payload.expires_in) || 3600) * 1000;
    token = payload.access_token;
    tokenExpiresAt = now() + Math.max(lifetimeMs - EXPIRY_SKEW_MS, 0);
    return token;
  }

  async function getToken() {
    if (token && now() < tokenExpiresAt) return token;
    pendingToken ??= requestToken().finally(() => {
      pendingToken = null;
    });
    return pendingToken;
  }

  function invalidateToken() {
    token = null;
    tokenExpiresAt = 0;
  }

  async function fetchListing(path, { retryOnUnauthorized = true } = {}) {
    const headers = { Accept: 'application/json', 'User-Agent': userAgent };
    let url = `${PUBLIC_BASE}${path.pathname}.json${path.search}`;

    if (authenticated) {
      headers.Authorization = `Bearer ${await getToken()}`;
      url = `${OAUTH_BASE}${path.pathname}${path.search}`;
    }

    const res = await request(url, { headers });

    // A revoked or prematurely expired token looks exactly like a bad one; drop
    // it and try once more before giving up.
    if (res.status === 401 && authenticated && retryOnUnauthorized) {
      invalidateToken();
      return fetchListing(path, { retryOnUnauthorized: false });
    }

    if (!res.ok) {
      throw new RedditError(`Reddit responded with HTTP ${res.status}`, { status: res.status });
    }

    return res.json();
  }

  return {
    /** True when requests are signed with OAuth credentials. */
    get authenticated() {
      return authenticated;
    },

    /**
     * Fetch the top posts of a subreddit, normalized for the game.
     *
     * @returns {Promise<Array<{id: string, title: string, subreddit: string, articleUrl: string|null, redditUrl: string|null}>>}
     */
    async fetchTopPosts(subreddit, { limit = 100, time = 'month' } = {}) {
      // raw_json=1 keeps Reddit from HTML-escaping titles, so an ampersand
      // arrives as "&" instead of "&amp;".
      const search = new URLSearchParams({ t: time, limit: String(limit), raw_json: '1' });
      const body = await fetchListing({
        pathname: `/r/${encodeURIComponent(subreddit)}/top`,
        search: `?${search}`,
      });

      const children = Array.isArray(body?.data?.children) ? body.data.children : [];
      return children.map(normalizePost).filter(Boolean);
    },
  };
}
