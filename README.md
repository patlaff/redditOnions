# Reddit Onions

A simple game based on an idea from [this AskReddit Thread](https://www.reddit.com/r/AskReddit/comments/920c2b/whats_a_drinking_game_you_can_play_with_the_front/) (credit to u/mujump)

Game pulls top 100 monthly posts from r/TheOnion and r/NotTheOnion (stores 200 total posts), randomizes a headline, and prompts the user to guess if it is real or fake.

## Prerequisites

* Node.js - http://nodejs.org

## Getting Started

* Clone the repo
* Install dependencies with `npm install`
* Run development server with `npm start` and go to: http://localhost:3000/

## Deployment

Production version deployed to http://redditonions.zavprnpybd.us-east-1.elasticbeanstalk.com/
*Some elastic beanstalk specific items may remain in this repo*

## Built With

* [NodeJS](http://nodejs.org) - Server-side Javascript
* [Express](https://expressjs.com/) - Web Framework for Node.js
* [EJS](http://ejs.co/) - Templating

## Contributing

Completely open source project! Feel free to submit pull requests

## Authors

* [**Patrick Lafferty**](https://github.com/patlaff) - *Owner*

## Acknowledgments

* Big thanks to [Jordan Reiter](https://github.com/JordanReiter) for helping out a newbie and submitting some pull requests that got me through big glaring bugs that were surfaced by r/Javascript :D
* r/Javascript and all the help on my [original post there](https://www.reddit.com/r/javascript/comments/9afwxk/i_made_my_first_nodejs_app_based_on_an_idea_from/)
