import { readChatBackend } from '../chat-backend';
import { createRunHandler, readRunOptions } from '../run-handler';

if (readChatBackend(process.env['ATC_CHAT_BACKEND']) !== 'openai') {
  throw new Error(
    'This ATC artifact was built for OpenAI; rebuild with ATC_CHAT_BACKEND=b4run for the agent backend',
  );
}

export default createRunHandler(readRunOptions(process.env));
