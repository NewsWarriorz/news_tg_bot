// LOGGING STARTS
const logdnaWinston = require('logdna-winston');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.Console({ format: winston.format.simple(), })
    ],
});


if (process.env.NODE_ENV == 'production') {
    const logdnaOptions = {
        key: process.env.LOGDNA_API_KEY,
        hostname: "news-tg",
        // ip: ipAddress,
        // mac: macAddress,
        app: "news-tg-bot",
        // env: envName,
        level: "debug", // Uses Winston log levels: https://github.com/winstonjs/winston#logging-levels
        handleExceptions: true
    };

    logger.add(new logdnaWinston(logdnaOptions));
}



// ELASTIC
const { Client } = require('@elastic/elasticsearch')
const client = new Client({
    node: process.env.ELASTIC_HOST,
    auth: {
        username: process.env.ELASTIC_USER,
        password: process.env.ELASTIC_PASSWORD
    }
})



// BOT LOGIC
const Telegraf = require('telegraf')
const Markup = require('telegraf/markup')
const rateLimit = require('telegraf-ratelimit')

// Set limit to 1 message per 3 seconds
const limitConfig = {
    window: 3000,
    limit: 1,
    onLimitExceeded: (ctx, next) => ctx.reply('Rate limit exceeded, bot is on beta testing. Try again after 3 sec.')
}

// init bot
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'https://newstgbot.herokuapp.com/';

const bot = new Telegraf(BOT_TOKEN)
bot.telegram.setWebhook(`${APP_URL}/bot${BOT_TOKEN}`);
bot.startWebhook(`/bot${BOT_TOKEN}`, null, PORT)
bot.use(rateLimit(limitConfig))

//error handling
bot.catch((err, ctx) => {
    logger.error(`Error for ${ctx.updateType}`, ctx, err)
})


const replyWithError = (ctx, error) =>
    ctx.replyWithMarkdown(
        `ERROR: ${error}\nPlease try again.`
    );


bot.start((ctx) => {
    msg =
    `Hi <b>${ctx.message.from.first_name}</b>,\n` +
    "Welcome to <b>NewsVerification Bot</b>\n" +
    "<i>We</i> are delighted to have you\n\n" +
    "<pre>How Does this Work?</pre>\n" +
    "<pre>Just start typing about things you want to find out and we will try to verify it from our database\nFYI: More words we have better the result will be\nTry Now!!!</pre>";
    return ctx.reply(
        msg,
        {
            parse_mode: "html",
        }
    );
});

bot.on('text', async (ctx) => {
    const { message } = ctx;
    if (message) {
        const { text } = message;
        if (text) {
            wordsLength = text.split(" ").length
            if (!(8 <= wordsLength  && wordsLength <= 5000)) {
                return replyWithError(ctx, "Search query should be between 8 to 5000 words.")
            }
            // search with elastic
            const { body } = await client.search({
                index: 'news-*',
                body: {
                    query: {
                        match: {
                            content: text
                        }
                    }
                }
            })

            if (body.hits.hits.length == 0) return ctx.reply("❌ No credible news source found.")

            let msg = ` Results for '${text.slice(0, 10)} ...'\n\n`
            body.hits.hits.slice(0, 3).forEach((hits, i) =>
                msg += `${i + 1}. ${hits._source.url} \n\n`
            );
            return ctx.reply(msg)
        }
    }
})

bot.launch()