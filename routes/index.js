
//REQUIRE STATMENTS//
const express           = require('express');
const request           = require('request');
const bodyParser        = require('body-parser');
const session           = require('express-session')
const router            = express.Router();

router.use(bodyParser.urlencoded({ extended: true }));
router.use(session({
    secret: 'snoo',
    resave: false,
    saveUninitialized: false
  }));

//GLOBAL VARIABLES//
var url = 'https://www.reddit.com/r/TheOnion+nottheonion/top/.json?t=month&limit=100'
var postIndex = 0
var ssn
var headlines
var headlineLookup = {}

//Make Reddit API call, return all data
request(url, { json: true }, (err, res, body) => {
    headlines = body.data.children
    console.log("Number of Posts: "+headlines.length)
    headlines.forEach(function (headline) {
        headlineLookup[headline.data.id] = headline.data;
    });
});

//GLOBAL FUNCTIONS//
function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max))
};
function getNewHeadline() {
    postIndex = getRandomInt(headlines.length)  //Used to pick a post from json array gathered from Reddit
    return headlines[postIndex].data
};
function getHeadline(id) {
    return headlineLookup[id];
}

//Index Page. Display new headline, and prompt user for a guess
router.get('/', function (req, res) {
    ssn = req.session;
    var headlineData = getNewHeadline()
    console.log("SubReddit: "+headlineData.subreddit)
    //ssn.userScore =
    res.render('guessPage', {
        headline: headlineData.title, 
        headlineID: headlineData.id
        //userScore: userScore
    });
});

//Result Page. Display result of the guess made by user
router.post('/result/:headlineID', function(req, res) {
    ssn = req.session
    var resultText, articleLink, redditLink
    var correctGuesses, wrongGuesses, userScore
    var headlineData = getHeadline(req.params.headlineID)
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
        headlineID: headlineData.id,
        articleLink: articleLink, 
        redditLink: redditLink
        //userScore: ssn.userScore
    });
});

//Return user to guesspage with new headline after results are shown
router.post('/refresh', function(req, res) {
    if(req.body.AnothaOne == 'AnothaOne') {
        res.redirect('/');
    }
})

module.exports = router;
