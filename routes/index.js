//REQUIRE STATMENTS//
const express           = require('express');
const createError       = require('http-errors');
const router            = express.Router();

//GLOBAL VARIABLES//
const subreddits = ['nottheonion', 'TheOnion']
const getSubredditUrl = (subreddit) => `https://www.reddit.com/r/${subreddit}/top/.json?t=month&limit=100`
const REFRESH_INTERVAL_MS = 60 * 60 * 1000  //Re-pull headlines hourly so the pool stays fresh
const FETCH_TIMEOUT_MS = 10 * 1000
var headlines = []
//Null-prototype map so a headline ID like "__proto__" or "constructor" can never
//resolve to an inherited Object property instead of a real headline.
var headlineLookup = Object.create(null)

//Make requests to each subreddit and fill headlines[] variable with 100 top posts from the last month each
async function loadHeadlines() {
    const nextHeadlines = []
    const nextLookup = Object.create(null)
    for (const subreddit of subreddits) {
        try {
            const res = await fetch(getSubredditUrl(subreddit), {
                headers: { 'Accept': 'application/json', 'User-Agent': 'redditonions/1.0' },
                redirect: 'error',  //Reddit should answer directly; never chase a redirect elsewhere
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            })
            if (!res.ok) {
                console.error(`Failed to load r/${subreddit}: HTTP ${res.status}`)
                continue
            }
            const body = await res.json()
            const sub_headlines = body && body.data && Array.isArray(body.data.children)
                ? body.data.children
                : []
            for (const headline of sub_headlines) {
                //Only keep posts we can actually render and link safely
                if (!headline || !headline.data || typeof headline.data.id !== 'string') continue
                const data = headline.data
                if (typeof data.title !== 'string' || typeof data.subreddit !== 'string') continue
                nextHeadlines.push(headline)
                nextLookup[data.id] = data
            }
        } catch (err) {
            //A failure on one subreddit must not take the process down
            console.error(`Failed to load r/${subreddit}:`, err.message)
        }
    }
    if (nextHeadlines.length === 0) {
        console.error('No headlines loaded; keeping the previously loaded set')
        return
    }
    headlines = nextHeadlines
    headlineLookup = nextLookup
    console.log("Number of Posts: " + headlines.length)
}

loadHeadlines()
setInterval(loadHeadlines, REFRESH_INTERVAL_MS).unref()

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
    if (headlines.length === 0) return null
    //Kept local: a shared index would race between concurrent requests
    const postIndex = getRandomInt(headlines.length)
    return headlines[postIndex].data
};
function getHeadline(id) {
    if (typeof id !== 'string') return null
    return headlineLookup[id] || null
}
//Reddit is the source of these URLs, but never emit a scheme the browser will
//execute (javascript:, data:) into an href.
function safeLink(url) {
    if (typeof url !== 'string') return null
    try {
        const parsed = new URL(url)
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null
    } catch (err) {
        return null
    }
}

//Index Page. Display new headline, and prompt user for a guess
router.get('/', function (req, res, next) {
    var headlineData = getNewHeadline()
    if (!headlineData) {
        return next(createError(503, 'Headlines are still loading, try again shortly.'))
    }
    res.render('guessPage', {
        headline: titleCase(headlineData.title),
        headlineID: headlineData.id
    });
});

//Result Page. Display result of the guess made by user
router.post('/result/:headlineID', function(req, res, next) {
    var resultText
    var headlineData = getHeadline(req.params.headlineID)
    if (!headlineData) {
        return next(createError(404, 'Unknown headline.'))
    }
    const guess = typeof req.body.guess === 'string' ? req.body.guess : ''
    if (guess !== 'nottheonion' && guess !== 'TheOnion') {
        return next(createError(400, 'Invalid guess.'))
    }
    if (guess == headlineData.subreddit) {
        resultText = 'CORRECT!'
    } else {
        if (guess == "nottheonion" && headlineData.subreddit == "TheOnion") {
            resultText = 'NOPE! That one was fake.'
        } else {
            resultText = 'NOPE! That one was real.'
        }
    }
    res.render('resultsPage', {
        result: resultText,
        headline: titleCase(headlineData.title),
        headlineID: headlineData.id,
        articleLink: safeLink(headlineData.url),
        redditLink: safeLink(`https://www.reddit.com${headlineData.permalink}`)
    });
});

//Return user to guesspage with new headline after results are shown
router.post('/refresh', function(req, res) {
    res.redirect('/');
})

module.exports = router;
