/**
 * This app is fully generative, and does not use any
 * router to manage what screens are shown. This class
 * lets child components send messages to an arbitrary
 * parent component.
 *
 * For example, the GameSetup component uses a uiChatResource
 * to display various views based on the game setup flow.
 * It provides itself as a ChatService to the child components,
 * so that they can send messages to the parent component.
 */
export abstract class ChatService {
  abstract sendMessage(message: string): void;
}
