
/*  OLD SAMPLE CODE 
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});
*/

//REQUIRE STATMENTS//
const express           = require('express');
const request           = require('request');
const bodyParser        = require('body-parser');

//SET TEMPLATE ENGINE//
//process.chdir(__dirname);
const app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

//GLOBAL FUNCTIONS//
function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}
function getNewHeadline() {
    postIndex = getRandomInt(50);   //Used to pick a post from the Subreddit defined above
    realOrFake = getRandomInt(2);   //0 = Real ; 1 = Fake
}
//function getUserScore(guess) {}

//GLOBAL VARIABLES//
const port = 1337;
const subreddit = {0: 'nottheonion', 1: 'theonion'}
let postIndex = getRandomInt(50);   //Used to pick a post from the Subreddit defined above
let realOrFake = getRandomInt(2);   //0 = Real ; 1 = Fake
let url = `https://www.reddit.com/r/${subreddit[realOrFake]}.json?limit=50`
let resultText = ''
let correctGuesses = 0
let wrongGuesses = 0
let userScore = 0
let headlineData = ''
let articleLink = ''
let redditLink = ''

//CREATE SERVER//
app.get('/', function (req, response) {
    getNewHeadline()
    console.log(subreddit[realOrFake])
    url = `https://www.reddit.com/r/${subreddit[realOrFake]}.json?limit=50`
    request(url, { json: true }, (err, res, body) => {
        headlineData = body.data.children[postIndex].data
        if(err){
            response.render('guessPage', {headline: null, userScore: userScore, error: 'Error getting headline. Please reload and try again.'});
        } else {
            if(headlineData.title == undefined) {
                response.render('guessPage', {headline: null, userScore: userScore, error: 'Error getting new headline. Please reload and try again.'});
            } else {
                response.render('guessPage', {headline: headlineData.title, userScore: userScore, error: null});
            }
        }
    })
});

app.post('/result', function(req, res) {
    console.log(req.body)
    console.log(req.body.guess)
    console.log(realOrFake)
    articleLink = headlineData.url
    redditLink = `https://www.reddit.com${headlineData.permalink}`
    if(req.body.guess == realOrFake) {
        resultText = 'CORRECT!'
        correctGuesses++
        userScore = correctGuesses - wrongGuesses
        console.log(resultText)
    } else {
        if(req.body.guess == 0 && realOrFake == 1) {
            resultText = 'NOPE! That one was fake.'
        } else {
            resultText = 'NOPE! That one was real.'
        }
        wrongGuesses++
        userScore = correctGuesses - wrongGuesses
        console.log(resultText)
    }
    res.render('resultsPage', {
        result: resultText, 
        headline: headlineData.title,
        articleLink: articleLink, 
        redditLink: redditLink, 
        userScore: userScore});
  });

app.post('/refresh', function(req, res) {
    if(req.body.AnothaOne == 'AnothaOne') {
        console.log(req.body.AnothaOne)
        res.redirect('/');
    }
})

app.listen(port, function () {
  console.log('App listening on port ' + port +'!');
});

module.exports = app;
