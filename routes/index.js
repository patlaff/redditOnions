
//REQUIRE STATMENTS//
var express           = require('express');
var request           = require('request');
var bodyParser        = require('body-parser');
var session           = require('express-session')
var router            = express.Router();

router.use(bodyParser.urlencoded({ extended: true }));
router.use(session({
    secret: 'snoo',
    cookie: {},
    resave: false,
    saveUninitialized: true
  }));

//GLOBAL VARIABLES//
var url = 'https://www.reddit.com/r/theonion+nottheonion/top/.json?t=month&limit=100'
var postIndex = 0
var headlineData = ''
var resultText = ''
var articleLink = ''
var redditLink = ''
var correctGuesses = 0
var wrongGuesses = 0
var userScore = 0
var headlines

//Make Reddit API call, return all data
request(url, { json: true }, (err, res, body) => {
    headlines = body.data.children
    console.log("Number of Posts: "+headlines.length)
});

//GLOBAL FUNCTIONS//
function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max))
};
function getNewHeadline() {
    postIndex = getRandomInt(headlines.length)  //Used to pick a post from json array gathered from Reddit
    headlineData = headlines[postIndex].data
};

//Index Page. Display new headline, and prompt user for a guess
router.get('/', function (req, response) {
    getNewHeadline()
    console.log("SubReddit: "+headlineData.subreddit)
    response.render('guessPage', {
        headline: headlineData.title, 
        userScore: userScore
    });
});

//Result Page. Display result of the guess made by user
router.post('/result', function(req, res) {
    console.log("SubReddit: "+headlineData.subreddit)
    console.log("Guess: "+req.body.guess)
    articleLink = headlineData.url
    redditLink = `https://www.reddit.com${headlineData.permalink}`
    if(req.body.guess == headlineData.subreddit) {
        resultText = 'CORRECT!'
        correctGuesses++
    } else {
        if(req.body.guess == "nottheonion" && headlineData.subreddit == "TheOnion") {
            resultText = 'NOPE! That one was fake.'
        } else {
            resultText = 'NOPE! That one was real.'
        }
        wrongGuesses++
    }
    userScore = correctGuesses - wrongGuesses
    console.log(resultText)
    res.render('resultsPage', {
        result: resultText, 
        headline: headlineData.title,
        articleLink: articleLink, 
        redditLink: redditLink, 
        userScore: userScore});
  });

//Return user to guesspage with new headline after results are shown
router.post('/refresh', function(req, res) {
    if(req.body.AnothaOne == 'AnothaOne') {
        res.redirect('/');
    }
})

module.exports = router;
