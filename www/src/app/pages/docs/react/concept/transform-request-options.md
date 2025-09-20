---
title: 'Transform Request Options: Hashbrown React Docs'
meta:
  - name: description
    content: 'Intercept and modify requests before they are sent to LLM providers.'
---
# Transform Request Options

<p class="subtitle">Intercept and modify requests before they are sent to LLM providers.</p>

The `transformRequestOptions` method enables developers to intercept requests in the adapter to mutate the request before it is sent to the LLM provider. 

- Server-side prompts: Inject additional context or instructions that shouldn't be exposed to the client
- Message mutations: Modify, filter, or enhance messages based on business logic  
- Request summarization: Compress or summarize lengthy conversation history
- Evaluation and logging: Log requests for debugging, monitoring, or evaluation purposes
- Dynamic configuration: Adjust model parameters based on runtime conditions

---

## How it Works

The `transformRequestOptions` function is called just before the request is sent to the LLM provider. It receives the complete request parameters and can return either a modified version synchronously or asynchronously via a Promise.

1. Define a transform function that receives platform-specific request parameters
2. Modify the parameters as needed (add system prompts, filter messages, etc.)
3. Return the transformed parameters
4. The adapter sends the modified request to the LLM provider

---

## Basic Usage

<hb-code-example header="server-side system prompt">

```ts
import { HashbrownOpenAI } from '@hashbrownai/openai';

const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  request: req.body,
  transformRequestOptions: (options) => {
    return {
      ...options,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        ...options.messages,
      ],
    };
  },
});
```

</hb-code-example>

In this example, we're adding a system message to every conversation without exposing it to the client-side code.

---

## Server-Side Context Injection

Inject user context and application state that shouldn't be visible to the client:

<hb-code-example header="user context injection">

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  request: req.body,
  transformRequestOptions: (options) => {
    const userContext = getUserContext(req.user.id);
    
    return {
      ...options,
      messages: [
        {
          role: 'system',
          content: `
            You are an AI assistant for ${userContext.companyName}.
            User role: ${userContext.role}
            Available features: ${userContext.features.join(', ')}
          `,
        },
        ...options.messages,
      ],
    };
  },
});
```

</hb-code-example>

This approach keeps sensitive user context on the server while still providing it to the LLM for personalized responses.

---

## Message Processing

Transform requests to modify message content based on business logic:

<hb-code-example header="message filtering">

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  request: req.body,
  transformRequestOptions: (options) => {
    return {
      ...options,
      messages: options.messages.map(message => {
        if (message.role === 'user') {
          // Filter out sensitive information
          const filteredContent = filterSensitiveData(message.content);
          return { ...message, content: filteredContent };
        }
        return message;
      }),
    };
  },
});
```

</hb-code-example>

---

## Dynamic Configuration

Adjust model parameters based on runtime conditions:

<hb-code-example header="dynamic parameters">

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  request: req.body,
  transformRequestOptions: (options) => {
    const userPlan = getUserPlan(req.user.id);
    
    return {
      ...options,
      temperature: userPlan === 'creative' ? 0.8 : 0.2,
      max_tokens: userPlan === 'free' ? 500 : undefined,
      tools: userPlan === 'premium' ? options.tools : undefined,
    };
  },
});
```

</hb-code-example>

---

## Async Transformations

Use async operations for database lookups or external API calls:

<hb-code-example header="async transforms">

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  request: req.body,
  transformRequestOptions: async (options) => {
    const userPreferences = await fetchUserPreferences(req.user.id);
    
    return {
      ...options,
      messages: [
        {
          role: 'system',
          content: `User prefers ${userPreferences.communicationStyle} responses.`,
        },
        ...options.messages,
      ],
    };
  },
});
```

</hb-code-example>

---

## Platform-Specific Considerations

### OpenAI
Supports all OpenAI chat completion parameters. Can modify `tools`, `tool_choice`, `response_format`, and more.

### Google (Gemini)
Uses `GenerateContentParameters` format with different message structure. System instructions are provided via `systemInstruction` parameter.

### Writer
Uses Writer-specific parameter format with similar capabilities to OpenAI.

### Azure OpenAI
Same parameters as OpenAI but ensure compatibility with your Azure deployment configuration.

---

## Error Handling

Always handle errors gracefully in your transform function:

<hb-code-example header="error handling">

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  request: req.body,
  transformRequestOptions: async (options) => {
    try {
      const enhancedOptions = await enhanceRequest(options);
      return enhancedOptions;
    } catch (error) {
      console.error('Failed to transform request:', error);
      // Return original options as fallback
      return options;
    }
  },
});
```

</hb-code-example>

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="platform/openai">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>OpenAI Platform</h4>
      <p>Learn how to use transformRequestOptions with OpenAI.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/system-instructions">
    <div>
      <hb-functions />
    </div>
    <div>
      <h4>System Instructions</h4>
      <p>Learn about system prompts and instructions.</p>
    </div>
  </hb-next-step>
</hb-next-steps>