import crypto from 'node:crypto';
import path from 'node:path';

import cookieParser from 'cookie-parser';
import createError from 'http-errors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import logger from 'morgan';

import { createRouter } from './routes/index.js';

function resolveSessionSecret(secret) {
  // Never ship a hardcoded session secret. Without SESSION_SECRET the process gets a
  // random one, so sessions simply do not survive a restart (already true of the
  // in-memory store) rather than being forgeable by anyone who read the source.
  if (secret) return secret;
  console.warn(
    'SESSION_SECRET is not set; using a random per-process secret. Scores will reset on restart.',
  );
  return crypto.randomBytes(32).toString('hex');
}

export function createApp({
  store,
  requestLogging = true,
  // Express defaults `app.get('env')` to 'development' when NODE_ENV is unset, which
  // would leak stack traces from a production box that simply forgot to set it.
  // Treat "development" as opt-in instead.
  isDevelopment = process.env.NODE_ENV === 'development',
  sessionSecret = process.env.SESSION_SECRET,
} = {}) {
  const app = express();

  // Behind the Elastic Beanstalk load balancer the app only sees the proxy's
  // connection, so `secure` cookies and real client IPs need X-Forwarded-*. Opt in
  // explicitly (TRUST_PROXY=1) — trusting those headers when nothing strips them
  // lets clients spoof their own address.
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY);
  }

  app.disable('x-powered-by');
  app.set('views', path.join(import.meta.dirname, 'views'));
  app.set('view engine', 'ejs');

  // Security headers. Everything the pages load is served from this origin, so the
  // policy can stay tight — no inline styles or scripts anywhere in the views.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: isDevelopment ? null : [],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  if (requestLogging) {
    app.use(logger(isDevelopment ? 'dev' : 'combined'));
  }

  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(cookieParser());

  app.use(
    session({
      name: 'redditonions.sid',
      secret: resolveSessionSecret(sessionSecret),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: !isDevelopment,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(
    express.static(path.join(import.meta.dirname, 'public'), {
      maxAge: isDevelopment ? 0 : '7d',
    }),
  );

  app.use('/', createRouter({ store }));

  // Catch 404s and forward to the error handler.
  app.use((req, res, next) => next(createError(404, 'That page does not exist.')));

  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    // Only surface a message the handler chose to expose; anything else (a thrown
    // TypeError, a filesystem path) becomes a generic string so internals stay in
    // the logs rather than in the response body.
    const message = err.expose ? err.message : 'Something went wrong on our end.';

    // An exposed 5xx is a state we chose to report (e.g. "still loading"); the
    // access log already records it. Only unexpected failures get a stack.
    if (status >= 500 && !err.expose) console.error(err);

    res.status(status).render('error', {
      title: `${status} — Reddit Onions`,
      status,
      message,
      stack: isDevelopment ? err.stack : null,
    });
  });

  return app;
}

export default createApp;
