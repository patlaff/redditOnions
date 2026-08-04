var createError = require('http-errors');
var express = require('express');
var session = require('express-session');
var helmet = require('helmet');
var crypto = require('crypto');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// Express defaults `app.get('env')` to 'development' when NODE_ENV is unset, which
// would leak stack traces from a production box that simply forgot to set it.
// Treat "development" as opt-in instead.
var isDevelopment = process.env.NODE_ENV === 'development';

// Behind the Elastic Beanstalk load balancer the app only sees the proxy's
// connection, so `secure` cookies and real client IPs need X-Forwarded-*. Opt in
// explicitly (TRUST_PROXY=1) — trusting those headers when nothing strips them
// lets clients spoof their own address.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY);
}

app.disable('x-powered-by');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Security headers. Everything the pages load is served from this origin, so the
// policy can stay tight.
app.use(helmet({
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
      upgradeInsecureRequests: isDevelopment ? null : []
    }
  },
  referrerPolicy: { policy: 'no-referrer' }
}));

app.use(logger('dev'));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// Never ship a hardcoded session secret. Without SESSION_SECRET the process gets a
// random one, so sessions simply do not survive a restart (already true of the
// in-memory store) rather than being forgeable by anyone who read the source.
var sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET is not set; using a random per-process secret. Sessions will not survive a restart.');
}

app.use(session({
  name: 'redditonions.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isDevelopment,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  var status = err.status || 500;
  // Only surface a message the handler chose to expose; anything else (a thrown
  // TypeError, a filesystem path) becomes a generic string so internals stay in
  // the logs rather than in the response body.
  var message = err.expose ? err.message : 'Something went wrong.';

  if (status >= 500) {
    console.error(err);
  }

  res.locals.message = message;
  res.locals.error = isDevelopment ? err : {};

  res.status(status);
  res.render('error');
});

module.exports = app;
