/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */

const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');
const {createChatCompletionWithTimeout} = require('open-ai-wrapper');

const OPEN_AI_TIMEOUT = 6000;
const PROGRESSIVE_RESPONSE_TIMEOUT = 1000;
const HELP_MESSAGE = "Hi, I'm Molly and I use AI to answer your questions. You can ask me things like 'Molly, how tall is the empire state building' or 'Molly, write a rap song about cats'. Just be sure to start your question with my name.";
const HELP_REPROMPT = 'What can I help you with?';
const HISTORY_COUNT = 5


const getUserAttributes = async (handlerInput) => {
    const attributesManager = handlerInput.attributesManager;
    let attributes = await attributesManager.getPersistentAttributes();

    if(!('used_credits' in attributes)) {
        attributes = { 
            ...attributes,
            used_credits: 0
        }

        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();
    }

    if(!('previous_messages' in attributes)) {
        attributes = { 
            ...attributes,
            previous_messages: []
        }

        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();
    }

    return attributes;
}

const saveUserAttributes = async (handlerInput, attributes) => {
    const attributesManager = handlerInput.attributesManager;
    attributesManager.setPersistentAttributes(attributes);
    await attributesManager.savePersistentAttributes();
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = "Hey there, my name is Molly and I'm an AI. You can ask me anything.";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("Is there anything I can help with?")
            .getResponse();
    }
};

function sendProgressiveResponse(handlerInput, speech) {
    const { requestEnvelope } = handlerInput
    const directiveServiceClient = handlerInput.serviceClientFactory.getDirectiveServiceClient()
    
    const directive = {
      header: {
        requestId: requestEnvelope.request.requestId
      },
      directive: {
        type: 'VoicePlayer.Speak',
        speech: speech
      }
    }
    return directiveServiceClient.enqueue(directive, requestEnvelope.context.System.apiEndpoint, requestEnvelope.context.System.apiAccessToken)
  }

const AskOpenAIIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AskOpenAIIntent';
    },

    async handle(handlerInput) {
        const attributes = await getUserAttributes(handlerInput);
        const question = Alexa.getSlotValue(handlerInput.requestEnvelope, 'question')

        let requestCompleted = false;
        setTimeout(async () => {
            if (!requestCompleted) {
                try {
                    await sendProgressiveResponse(handlerInput, "One moment, I'm thinking.");
                }
                catch(err) {
                    console.log('DIRECTIVE ERROR:' + err);
                }
            }
        }, PROGRESSIVE_RESPONSE_TIMEOUT);
        
        const completion = await createChatCompletionWithTimeout(question, OPEN_AI_TIMEOUT, attributes.previous_messages);
        requestCompleted = true;

        attributes.used_credits = attributes.used_credits + 1;
        attributes.previous_messages.push({
            "prompt": question,
            "response": completion
        })
        if (attributes.previous_messages.length > HISTORY_COUNT) {
            attributes.previous_messages.shift()
        }
        await saveUserAttributes(handlerInput, attributes);

        const speakOutput = `${completion}. Is there anything else I can help with?`;
        return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt("Is there anything else I can help with?")
                .getResponse();
    },
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
        console.log("*****-FallbackIntentHandler.canHandle");
        console.log(handlerInput);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        console.log("*****-FallbackIntentHandler.handle");
        console.log(handlerInput);
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
        console.log("*****-SessionEndedRequestHandler.canHandle");
        console.log(handlerInput);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log("*****-SessionEndedRequestHandler.handlerInput");
        console.log(handlerInput);
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
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
        console.log(error);
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const HelpHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(HELP_MESSAGE)
      .reprompt(HELP_REPROMPT)
      .getResponse();
  },
};





/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        AskOpenAIIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        HelpHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withPersistenceAdapter(
            new ddbAdapter.DynamoDbPersistenceAdapter({
                tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
                createTable: false,
                dynamoDBClient: new AWS.DynamoDB({apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION})
            })
        )
    .withCustomUserAgent('coniferlabs/molly-ai/v0.1')
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();
