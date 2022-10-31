'use strict';
const chromium = require("@sparticuz/chrome-aws-lambda");
const playwright = require('playwright-core');
const Alexa = require('ask-sdk-core');
const {DateTime} = require('luxon');
const AWS = require("aws-sdk");
const dynamo = new AWS.DynamoDB.DocumentClient();

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'Welcome, you can say Hello or Help. Which would you like to try?';
         
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const GetGasPriceIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetGasPriceIntent';
    },
    async handle(handlerInput) {
        let text = null;
        let browser = null;
        let today = DateTime.now().setZone('America/New_York').toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY);
        let yesterday = DateTime.now().setZone('America/New_York').minus({days:1}).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY);
        //see if there is acahced response for today
        try{
           const cachedResponse = await getFromCache(today);
           const yesterdaysResponse = await getFromCache(yesterday);
           if(cachedResponse.Item?.text && (yesterdaysResponse.Item?.text !== cachedResponse.Item?.text)){
            return handlerInput.responseBuilder
            .speak(cachedResponse.Item?.text)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
           }
        }catch(e){
            console.error('Error getting cache text',e);
        }
        try {
            browser = await playwright.chromium.launch({
                args: chromium.args,
                executablePath: await chromium.executablePath,
                headless: chromium.headless,
              });

            let page = await browser.newPage();

            await page.goto('https://toronto.citynews.ca/toronto-gta-gas-prices');
            const div = await page.$('.float-box'); 
            text = await div.innerText();
            text = text.replace("En-Pro tells CityNews that",'');
            if(text.includes("No Change")){
                text = "No need to fill up today, as " + text.replace("No Change","");
            }else if(text.includes("expected to fall")){
                text = "Wait until tomorrow, because prices are going down tomorrow " + text;
            }else if(text.includes("expected to rise")){
                text = "Fill up today, because prices are going up tomorrow " + text;
            }

            text = text.replace('cent(s)/litre', 'cents per litre');
            const p = await page.$('#post-content-area > p');
            const note = await p.innerText();
            text = text + " " + note;
            await saveToCache({
                date: today,
                text: text
            });
        } catch (error) {
            return callback(error);
        } finally {
            if (browser !== null) {
            await browser.close();
            }
        }
        return handlerInput.responseBuilder
        .speak(text)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse();
       
       
        //const speakOutput = $('.float-box',html).text().replace("En-Pro tells CityNews that",".");

        
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Sorry, I had trouble doing what you asked. Please try again.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const getFromCache = async function(date){
    try{
        const body = await dynamo
        .get({
            TableName: "gas-prices",
            Key: {
                date: date 
            }
            })
            .promise();
        return body;   
    }catch(e){
        console.error(e);
        throw e;
    }
}

const saveToCache = async function(body){
    try{
        await dynamo
          .put({
            TableName: "gas-prices",
            Item: {
              date: body.date,
              text: body.text
            }
          })
          .promise();
        return `Cached ${body}`;
    }catch(e){
        console.error(e);
        throw e;
    }
}

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        GetGasPriceIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withCustomUserAgent('sample/hello-world/v1.2')
    .lambda();
