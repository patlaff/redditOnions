
//REQUIRE STATMENTS//
const express           = require('express');
const request           = require('request');
const bodyParser        = require('body-parser');
var   router            = express.Router();

//SET TEMPLATE ENGINE//
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
let url = `https://www.reddit.com/r/${subreddit[realOrFake]}/top/.json?t=week&limit=100`
let resultText = ''
let correctGuesses = 0
let wrongGuesses = 0
let userScore = 0
let headlineData = ''
let articleLink = ''
let redditLink = ''

//Make Reddit API call, return headline, and prompt user for a guess
app.get('/', function (req, response) {
    getNewHeadline()
    console.log(subreddit[realOrFake])
    url = `https://www.reddit.com/r/${subreddit[realOrFake]}/top/.json?t=week&limit=100`
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

//display result of the guess made by user
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

//return user to guesspage with new headline after results are shown
app.post('/refresh', function(req, res) {
    if(req.body.AnothaOne == 'AnothaOne') {
        console.log(req.body.AnothaOne)
        res.redirect('/');
    }
})

//listen on specific port
app.listen(port, function () {
  console.log('App listening on port ' + port +'!');
});

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

module.exports = router;
