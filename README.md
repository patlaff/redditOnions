# Reddit Onions

Real headline, or Onion headline?

A small guessing game based on an idea from [this AskReddit thread](https://www.reddit.com/r/AskReddit/comments/920c2b/whats_a_drinking_game_you_can_play_with_the_front/)
(credit to u/mujump). It draws on top posts from
[r/nottheonion](https://www.reddit.com/r/nottheonion/) and
[r/TheOnion](https://www.reddit.com/r/TheOnion/), shows you one at random, and asks
you to call it. Your score, accuracy, and streak are tracked for the session.

Headlines are served from a corpus committed to this repo, so the app runs with
no API key and no network access — see
[Where headlines come from](#where-headlines-come-from).

[![CI](https://github.com/patlaff/redditOnions/actions/workflows/ci.yml/badge.svg)](https://github.com/patlaff/redditOnions/actions/workflows/ci.yml)

## Quick start

```sh
git clone https://github.com/patlaff/redditOnions.git
cd redditOnions
npm install
npm run dev
```

Open http://localhost:3000. That is the whole setup — there is nothing to
configure to play. For a production run, copy `.env.example` to `.env`, set at
least `SESSION_SECRET`, and start with `node --env-file=.env server.js`.

Requires **Node.js 22 or newer** (see `.nvmrc`).

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Run the server. |
| `npm run dev` | Run with `NODE_ENV=development` and auto-restart on file changes. |
| `npm test` | Run the test suite (`node --test`, no test framework needed). |
| `npm run test:watch` | Re-run tests on change. |
| `npm run lint` | ESLint. |
| `npm run refresh-headlines` | Rebuild `data/headlines.json` from Reddit. Run it locally, not on a server — see below. |

## Where headlines come from

The app serves headlines from **`data/headlines.json`**, a file committed to this
repo. It is loaded at startup, so the game works with no API key, no credentials,
and no outbound network access at all.

That is not a fallback — it is the primary source, because as of 2025 a deployed
instance cannot fetch from Reddit:

- **The API requires approval.** Self-serve app registration is gone. Every new
  OAuth client goes through Reddit's
  [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)
  review, which is aimed at established commercial use.
- **The keyless endpoints are blocked from the cloud.** The public `.json` and
  `.rss` URLs still work without a key, but Reddit blocks AWS IP ranges at the
  network layer, so they return `403` from Elastic Beanstalk regardless of auth.

The one path you can get is the one AWS cannot reach, which is why the corpus is
committed rather than fetched.

### Refreshing the corpus

Run this from a machine Reddit will serve — a laptop on a home connection, not a
cloud host — then commit the result:

```sh
npm run refresh-headlines               # merge new posts into the corpus
npm run refresh-headlines -- --replace  # discard the old corpus entirely
npm run refresh-headlines -- --limit=50 --time=year
```

Merging is the default, so running it periodically grows the pool instead of
churning it. The script refuses to write when Reddit returns nothing, so a failed
run leaves the committed corpus intact.

> The corpus currently in the repo is a **hand-written starter set**: the titles
> were written from memory rather than fetched, so wording may differ from what
> was published and no entry has an article or comments link. Run the refresh
> script with `--replace` to swap it for real data.

### Optional: live fetching

Live refreshes are off by default. Where Reddit *is* reachable, turn them on and
the app will replace the corpus hourly with fresh posts, falling back to the
corpus whenever a refresh fails.

- `REDDIT_CLIENT_ID` — use OAuth. Set this if an access request is approved; get
  the credentials from https://www.reddit.com/prefs/apps. A **script** or **web
  app** also has a secret (`REDDIT_CLIENT_SECRET`); an **installed app** has
  none, and the client uses the anonymous device grant instead.
- `REDDIT_ANONYMOUS=1` — use the keyless public endpoints. Useful for local
  development; it will not work from a cloud host.

## Configuration

Every setting is optional, but production deployments should set all of them.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. |
| `NODE_ENV` | *(unset)* | Set to `development` locally. Anything else is treated as production: no stack traces on the error page, and the session cookie is marked `Secure`. |
| `SESSION_SECRET` | random per process | A long random string (`openssl rand -hex 32`). Without it, scores reset whenever the process restarts. Never commit a value. |
| `REDDIT_CLIENT_ID` | *(unset)* | Enables hourly live refreshes over OAuth. Unset, the app serves the committed corpus. |
| `REDDIT_CLIENT_SECRET` | *(unset)* | Omit for an "installed app". |
| `REDDIT_ANONYMOUS` | *(unset)* | Set to `1` to refresh from the keyless endpoints. Local development only — blocked from cloud hosts. |
| `REDDIT_USER_AGENT` | `web:redditonions:v1.0 (by /u/patlaff)` | Sent on every Reddit request. |
| `TRUST_PROXY` | *(unset)* | Set to `1` behind a TLS-terminating load balancer (e.g. Elastic Beanstalk) so `Secure` cookies and client IPs work. Leave unset otherwise — trusting `X-Forwarded-*` with no proxy in front lets clients spoof their address. |

## How it works

The headline pool lives in memory. It is filled from the committed corpus
synchronously at startup, so the first request is already playable. If live
fetching is configured, an hourly refresh replaces the pool with fresh posts —
and only when it actually returned headlines, so a failed refresh leaves the game
playable with what it already had rather than emptying it.

```
server.js              Entry point: wiring, signal handling, graceful shutdown
app.js                 Express app factory (middleware, security headers, error handling)
routes/index.js        The three pages plus /healthz
data/headlines.json    The committed headline corpus — the default source
lib/corpus.js          Corpus loading and validation
lib/reddit.js          Reddit API client: OAuth token cache, listing normalization
lib/headlines.js       In-memory headline pool, corpus-backed with optional refresh
lib/score.js           Session score and streak
lib/text.js            Headline title-casing
scripts/               The corpus refresh command
views/                 EJS templates
public/                Stylesheet, keyboard-shortcut script, images
test/                  node:test suites
```

`GET /healthz` reports the pool size, which source filled it (`corpus` or
`live`), and the last refresh error. It answers `503` only when the pool is
empty, which with a committed corpus means the corpus itself failed to load.

### Playing with the keyboard

`R` or `←` guesses real, `F` or `→` guesses fake, `Enter` draws the next
headline. Everything is also a plain button or link, so the game works with
JavaScript disabled.

## Deployment

The repo carries Elastic Beanstalk config in `.ebextensions/`; `npm start` is the
entry point. Set the environment variables above in the EB console (or your
platform's equivalent) rather than committing them, and set `TRUST_PROXY=1` since
EB terminates TLS at the load balancer.

Before deploying, run `npm test`, `npm run lint`, and `npm audit`.

## Built with

* [Node.js](https://nodejs.org) — 22+
* [Express 5](https://expressjs.com/)
* [EJS](https://ejs.co/) — templating
* [Helmet](https://helmetjs.github.io/) — security headers
* No front-end framework. The stylesheet and the 30-line keyboard script are the
  entire client.

## Contributing

Completely open source. Pull requests welcome — please keep `npm test` and
`npm run lint` green.

## Authors

* [**Patrick Lafferty**](https://github.com/patlaff) — *Owner*

## Acknowledgments

* Big thanks to [Jordan Reiter](https://github.com/JordanReiter) for helping out a
  newbie and submitting some pull requests that got me through big glaring bugs
  surfaced by r/javascript :D
* r/javascript and all the help on my
  [original post there](https://www.reddit.com/r/javascript/comments/9afwxk/i_made_my_first_nodejs_app_based_on_an_idea_from/)
