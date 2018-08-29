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
const subreddits = ['nottheonion', 'TheOnion']
const getSubredditUrl = (subreddit) => `https://www.reddit.com/r/${subreddit}/top/.json?t=month&limit=100`
var postIndex = 0
var ssn
var headlines = []
var headlineLookup = {}

//Make requests to each subreddit and fill headlines[] variable with 100 top posts from the last month each
subreddits.forEach((subreddit) => {
    var url = getSubredditUrl(subreddit)
    request(url, { json: true }, (err, res, body) => {
        var sub_headlines = body.data.children
        headlines.push(...sub_headlines)
        console.log("Number of Posts: "+headlines.length)
        sub_headlines.forEach(function (headline) {
            headlineLookup[headline.data.id] = headline.data;
        });
    })
})

//GLOBAL FUNCTIONS//
function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max))
};
function titleCase(str) {
    return str.replace(
        /\w\S*/g,
        function(txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}
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
        headline: titleCase(headlineData.title), 
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
        headline: titleCase(headlineData.title),
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
