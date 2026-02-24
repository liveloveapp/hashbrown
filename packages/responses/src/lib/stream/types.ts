/**
 * Open Responses tool definition.
 *
 * @public
 */
export type OpenResponsesTool = {
  type: 'function';
  name: string;
  description?: string;
  parameters?: object;
};

/**
 * Open Responses message input item.
 *
 * @public
 */
export type OpenResponsesMessageItem = {
  type: 'message';
  role: 'user' | 'assistant';
  content: string;
};

/**
 * Open Responses function call input item.
 *
 * @public
 */
export type OpenResponsesFunctionCallItem = {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
};

/**
 * Open Responses function call output input item.
 *
 * @public
 */
export type OpenResponsesFunctionCallOutputItem = {
  type: 'function_call_output';
  call_id: string;
  output: string;
};

/**
 * Open Responses input item union.
 *
 * @public
 */
export type OpenResponsesInputItem =
  | OpenResponsesMessageItem
  | OpenResponsesFunctionCallItem
  | OpenResponsesFunctionCallOutputItem;

/**
 * Open Responses request payload for creating a response.
 *
 * @public
 */
export type OpenResponsesCreateResponseRequest = {
  model: string;
  instructions?: string;
  input?: OpenResponsesInputItem[];
  tools?: OpenResponsesTool[];
  tool_choice?: 'auto' | 'none' | 'required';
  response_format?: object;
  stream?: boolean;
};
