// LOGGING STARTS
const logdnaWinston = require('logdna-winston');
const winston = require('winston');
const { Client } = require('@elastic/elasticsearch')
const express = require('express');
const Telegraf = require('telegraf')
const rateLimit = require('telegraf-ratelimit')

const logger = winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.Console({ format: winston.format.simple(), })
    ],
});


const { NODE_ENV } = process.env;

if (NODE_ENV !== "production") require("dotenv").config();

const { BOT_TOKEN, PORT, APP_URL, ELASTIC_HOST, ELASTIC_PASSWORD, ELASTIC_USER } = process.env;

if (!BOT_TOKEN || !ELASTIC_PASSWORD || !ELASTIC_HOST || !APP_URL)
    throw new Error("Environment variables can't be null");

const expressApp = express();
const bot = new Telegraf(BOT_TOKEN)

bot.use(
    rateLimit({
        window: 2000,
        limit: 1,
        onLimitExceeded: (ctx) =>
            ctx.reply("Rate limit exceeded, bot is on beta testing. Try again after 2 sec."),
    })
);


// ELASTIC
const client = new Client({
    node: process.env.ELASTIC_HOST,
    auth: {
        username: process.env.ELASTIC_USER || "elastic",
        password: process.env.ELASTIC_PASSWORD
    }
})
logger.info(`Sucessfully connected to elasticsearch host ${process.env.ELASTIC_HOST}`)



// BOT LOGIC
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
            if (!(8 <= wordsLength && wordsLength <= 5000)) {
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
            return ctx.reply(msg, { disable_web_page_preview: true })
        }
    }
})

// bot.launch()
// expressApp.get('/', (req, res) => {
//     res.send('NewzWarriors Telegram Bot https://t.me/NewsWarriorbot');
// });
// expressApp.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });

if (NODE_ENV !== "production") {
    console.info("Development environment");
    bot.startPolling();
} else {
    console.info("Production environment");
    bot.telegram.setWebhook(`${APP_URL}/bot${BOT_TOKEN}`);
    expressApp.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));
}

expressApp.get("/", (req, res) => {
    res.send('NewzWarriors Telegram Bot https://t.me/NewsWarriorbot');
});
expressApp.listen(PORT, () => console.info(`Server running on ${PORT}`));