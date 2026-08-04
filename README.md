# Reddit Onions

Real headline, or Onion headline?

A small guessing game based on an idea from [this AskReddit thread](https://www.reddit.com/r/AskReddit/comments/920c2b/whats_a_drinking_game_you_can_play_with_the_front/)
(credit to u/mujump). It pulls the top 100 monthly posts from
[r/nottheonion](https://www.reddit.com/r/nottheonion/) and
[r/TheOnion](https://www.reddit.com/r/TheOnion/), shows you one at random, and asks
you to call it. Your score, accuracy, and streak are tracked for the session.

[![CI](https://github.com/patlaff/redditOnions/actions/workflows/ci.yml/badge.svg)](https://github.com/patlaff/redditOnions/actions/workflows/ci.yml)

## Quick start

```sh
git clone https://github.com/patlaff/redditOnions.git
cd redditOnions
npm install
cp .env.example .env      # then fill in your Reddit credentials (see below)
node --env-file=.env server.js
```

Open http://localhost:3000. Without a `.env` you can still just run `npm run dev`,
but see the caveat under [Reddit credentials](#reddit-credentials).

Requires **Node.js 22 or newer** (see `.nvmrc`).

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Run the server. |
| `npm run dev` | Run with `NODE_ENV=development` and auto-restart on file changes. |
| `npm test` | Run the test suite (`node --test`, no test framework needed). |
| `npm run test:watch` | Re-run tests on change. |
| `npm run lint` | ESLint. |

## Reddit credentials

Reddit heavily rate limits anonymous API requests and frequently rejects them
outright when they come from a server rather than a browser — so a deployment
without credentials will often show "Headlines are still loading". The app signs
its requests with app-only OAuth when you configure a client ID.

1. Go to https://www.reddit.com/prefs/apps and click **create another app**.
2. Choose **script** (or **web app**) and give it any redirect URI, e.g.
   `http://localhost:3000`.
3. Copy the client ID (the string under the app name) into `REDDIT_CLIENT_ID`
   and the secret into `REDDIT_CLIENT_SECRET`.
4. Set `REDDIT_USER_AGENT` to something that identifies you — Reddit throttles
   generic user agents much harder.

An **installed app** has no secret; leave `REDDIT_CLIENT_SECRET` empty and the
client automatically uses the anonymous device grant instead.

With no `REDDIT_CLIENT_ID` at all, the app falls back to the public
`https://www.reddit.com/r/<sub>/top.json` endpoints, which is fine for local
development but not for a deployed instance.

## Configuration

Every setting is optional, but production deployments should set all of them.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. |
| `NODE_ENV` | *(unset)* | Set to `development` locally. Anything else is treated as production: no stack traces on the error page, and the session cookie is marked `Secure`. |
| `SESSION_SECRET` | random per process | A long random string (`openssl rand -hex 32`). Without it, scores reset whenever the process restarts. Never commit a value. |
| `REDDIT_CLIENT_ID` | *(unset)* | Enables OAuth. See above. |
| `REDDIT_CLIENT_SECRET` | *(unset)* | Omit for an "installed app". |
| `REDDIT_USER_AGENT` | `web:redditonions:v1.0 (by /u/patlaff)` | Sent on every Reddit request. |
| `TRUST_PROXY` | *(unset)* | Set to `1` behind a TLS-terminating load balancer (e.g. Elastic Beanstalk) so `Secure` cookies and client IPs work. Leave unset otherwise — trusting `X-Forwarded-*` with no proxy in front lets clients spoof their address. |

## How it works

The headline pool lives in memory and refreshes hourly. A refresh only replaces
the pool if it actually returned headlines, so a Reddit outage leaves the game
playable with the previous set rather than emptying it.

```
server.js              Entry point: wiring, signal handling, graceful shutdown
app.js                 Express app factory (middleware, security headers, error handling)
routes/index.js        The three pages plus /healthz
lib/reddit.js          Reddit API client: OAuth token cache, listing normalization
lib/headlines.js       In-memory headline pool with periodic refresh
lib/score.js           Session score and streak
lib/text.js            Headline title-casing
views/                 EJS templates
public/                Stylesheet, keyboard-shortcut script, images
test/                  node:test suites
```

`GET /healthz` returns the pool size and the last refresh error, and answers
`503` until the first successful load — useful as a load balancer health check.

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
