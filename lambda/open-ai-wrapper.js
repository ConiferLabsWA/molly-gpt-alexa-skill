const {Configuration, OpenAIApi} = require('openai');
const keys = require('keys');

const config = new Configuration({
    apiKey: keys.OPEN_AI_KEY
})
const openai = new OpenAIApi(config);

module.exports = {
    async createChatCompletionWithTimeout(prompt, timeout=10000, previous_messages=[], chunk_cb=undefined, chunk_word_size=5) {
        let completionResult = '';
        let chunks = '';
        let timedout = false;
        const startTime = new Date().getTime()


        return new Promise((resolve, reject) => {
            const completionMessages = [
                {
                    'role': 'system',
                    'content': 'You are a friendly and helpful virtual assistant. Respond to questions as best as possible with a friendly tone.'
                }
            ]

            previous_messages.forEach(m => {
                completionMessages.push(
                    {
                        'role': 'user',
                        'content': m["prompt"]
                    }
                )
                completionMessages.push(
                    {
                        'role': 'assistant',
                        'content': m["response"]
                    }
                )
            })

            completionMessages.push(
                {
                    'role': 'user',
                    'content': prompt
                }
            )

            openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: completionMessages,
                max_tokens: 1000,
                temperature: 0.1,
                stream: true,
            }, { responseType: 'stream' }).then((res) => {

                res.data.on('data', data => {
                    messages = data.toString('utf8').split('\n').filter(i => i.length > 0)
                    messages.forEach(message => {
                        message = message.replace('data: ', '').trim()
                        if (message === "[DONE]") {
                            if (chunk_cb && chunks) {
                                chunk_cb(chunks);
                            }
                            resolve(completionResult)
                        }
                        else {
                            try {
                                payload = JSON.parse(message);
                                if ('object' in payload && payload['object'] === "chat.completion.chunk") {
                                    const choice = payload['choices'][0]
                                    if ('delta' in choice && 'content' in choice['delta']) {
                                        const content = payload['choices'][0]['delta']['content']
                                        completionResult += content
                                        if (chunk_cb) {
                                            chunks += content
                                        }
                                    }
                                }
                            } catch (error) { }
                        }
                    })
                    
                    if (!timedout) {
                        if (chunk_cb) {
                            const words = chunks.split(" ");
                            if (words.length > chunk_word_size) {
                                const chunk = words.slice(0, words.length-1).join(" ");
                                chunks = chunks.replace(chunk, '');
                                chunk_cb(chunk);
                            }
                        }

                        const timeDiff = new Date().getTime() - startTime;
                        if (timeDiff > timeout) {
                            timedout = true;
                            res.request.socket.end()

                            if (chunk_cb) {
                                chunk_cb(chunks);
                                chunks = '';
                            }

                            resolve(completionResult)
                        }
                    }
                    
                });

                res.data.on('end', () => {
                    resolve(completionResult)
                })
            }).catch(err => {
                console.log(err)
                reject(err);
            })
        });
    }
}