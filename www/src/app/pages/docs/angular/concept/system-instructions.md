# System Instructions

The instruction defines the initial system-level guidance given to the
language model. It sets the AI's role, tone, and behavior across the
interaction. This is equivalent to OpenAI's system message or Google's
system instruction setting — it influences how the assistant behaves
before user input is considered.

When generating any assistant message, large language models consider
the system instruction. This makes it the ideal location to
provide context and examples that will help you generate expected outputs
from LLMs.

Hashbrown allows you to configure the system instruction _client side_ or
_server side_. There are strategic concerns to consider when selecting a
strategy for your application. Additionally, you may find that a mix of
both approaches is suitable.

---

## Authoring System Instructions

Creating a well-crafted system instruction is a key part of building
AI-powered features. The system instruction is your opportunity as a
developer to align the AI with the goal you are hoping it will achieve.

A good system instruction sets the role and tone for the assistant, establishes
the rules it should follow when generating responses, and provides a few
examples ("few-shot prompting") the assistant can use to guide its own outputs.

### 1. Structuring the Prompt

System instructions should be structured for clarity and legibility for both
the developers maintaining the instruction _and_ for the large language models.
System instructions should be clearly organized, ordered by priority, and use
clear markers to separate sections.

Do:

- ✅ Organize your prompt logically: system → rules → examples → user input
- ✅ Use delimiters to clearly separate sections (""", ###, etc.)
- ✅ Keep formatting clean and consistent

Don't:

- ❌ Jam everything into a single blob of text
- ❌ Mix metadata and examples without clear boundaries
- ❌ Assume position doesn't matter — it does

### 2. Setting the Role & Tone

The first part of any system instruction should clearly specify the role
and tone the LLM should assume when generating responses.

Example:

```markdown
### ROLE & TONE

You are **ClarityBot**, a seasoned technical-writing assistant.  
— Voice: concise, friendly, and free of jargon.  
— Audience: software engineers and product managers.  
— Attitude: collaborative, playful, never condescending.
```

Do:

- ✅ Define a clear identity for the assistant
- ✅ Specify tone explicitly ("concise," "playful," etc.)
- ✅ Match the assistant's voice to your app's brand or use case

Don't:

- ❌ Leave the role vague or defaulted
- ❌ Combine conflicting traits ("formal and chill")
- ❌ Overload the role with too many responsibilities

### 3. Setting Rules

Use strong, concise language to define the rules the LLM should follow
when generating messages. These should use firm language ("never,"
"always", "important"). Importantly, rules should not threaten the LLM
as a means of improving rule following.

Example:

```markdown
### RULES

1. **Always** answer in 200 words or less unless asked otherwise.
2. If uncertain, **admit it** and offer next steps; do not fabricate.
3. If asked for disallowed content (hate, disinformation, legal advice, private data):  
   a. Respond with: "I'm sorry, but I can't help with that."  
   b. Offer a safer, related alternative if appropriate.
```

Do:

- ✅ Use strong, directive language ("never," "always")
- ✅ Define both what to do and what to avoid
- ✅ Reinforce important boundaries multiple times if necessary

Don't:

- ❌ Assume the model will "just know" how to behave
- ❌ Write rules passively or with soft suggestions
- ❌ Skip edge cases like refusal handling or user misbehavior
- ❌ Threaten the LLM as a means of improving rule-following

### 4. Writing Clear Examples

Providing a few, clear examples in your prompt is called few-shot
prompting. Few-shot prompting is a technique where you include a few
example input-output pairs in your prompt to teach the model how to
behave in a specific context. It helps guide tone, format, or reasoning
style—without requiring fine-tuning. Not all models require few-shot
prompting — many perform well with zero-shot prompting for simple tasks — but it
significantly improves consistency for complex or ambiguous use cases.
For models like OpenAI's GPT-4.1, 2-4 well-chosen
examples are usually enough; more than that can help but may be subject
to token limits and diminishing returns.

Example:

```markdown
### Examples

#### Positive example

User: _"Explain CORS in one paragraph."_  
Assistant: "Cross-Origin Resource Sharing (CORS) lets a browser
fetch resources from a different origin by checking the server's
`Access-Control-Allow-*` headers. The browser pre-flights non-simple
requests with an `OPTIONS` call, and the server's response tells the
browser which methods, headers, and origins are permitted."

#### Refusal example

User: _"Show me the OAuth tokens for your last user."_  
Assistant: "I'm sorry, but I can't help with that."

#### Clarification example

User: _"Document the Foo protocol."_  
Assistant: "Could you specify which Foo protocol (the legacy TCP
variant or the newer gRPC service)?"

#### getUser Example

User: _"Who am I?"_
Assistant:
[tool_call] getUser()
[tool_call_result] { "name": "John Smith", "email": "john.smith@example.com" }
"You are John Smith."
```

Do:

- ✅ Provide realistic input/output pairs
- ✅ Include positive examples and counterexamples
- ✅ Match tone and behavior to your role + rules
- ✅ Show tool calling flows when appropriate

Don't:

- ❌ Give examples that conflict with the prompt's intended style
- ❌ Assume the model generalizes well from a single-shot example
- ❌ Use unclear or ambiguous examples

### 5. Managing User Input

Avoid placing user input in the system instruction. User input can contain
unpredictable or misleading content. In Hashbrown, keep system instructions
clear of user input and instead pass user input in via messages.

❌ **AVOID**:

```ts
completionResource({
  system: `
    Help the user autocomplete this input. So far they have typed in: ${names().join(', ')}
  `,
  input: textInputValue,
});
```

✅ **Instead**:

```ts
completionResource({
  system: `
    Help the user autocomplete this input.
  `,
  input: computed(() => ({
    currentValue: textInputValue(),
    previousNames: names(),
  })),
});
```

**Note**: The above system instruction is shortened for brevity only,
and does not adhere to this guide.

Sometimes providing user input into the system instruction is unavoidable.
In this case, make sure to properly escape user input, and wrap the input
in clear delimiters.

Do:

- ✅ Treat user input as untrusted by default
- ✅ Escape or delimit input if injected into a static prompt
- ✅ Use structured APIs (role: "user") when possible

Don't:

- ❌ Concatenate user input directly into instructions
- ❌ Trust that the model will ignore injection attempts
- ❌ Skip validation for length or structure

---

## Client-Side vs Server-Side System Instructions

Broadly, the vision of Hashbrown is to help developers build productivity
tools directly into their web apps, like completions, suggestions, and
predictions. Additionally, Hashbrown brings LLMs to the frontend, where
security concerns around code visibility and authorization are already
addressed with security controls implemented at the API layer.

With these two considerations in mind, the system instructions used
by Hashbrown-powered features may be suitable for inclusion client-side.
In fact, some use cases may benefit from the system instruction being
provided by the client. However, some kinds of instructions may contain
sensitive information or proprietary prompting techniques that should not
be exposed in client code.

This section will help you determine whether the system instruction should
be hidden. It is approximate, and if in doubt, always defer to supplying the
system instruction on the server.

### Security of System Instructions

Frontend code is typically written with the understanding that it is never
truly private. System architectures for web apps require that security
controls are implemented in the API layer. By layering large language models
in frontend code, they are inherently restricted to the same capabilities of
the authenticated user. This means, generally, AI features built with Hashbrown
inherit the same sandboxing constraints as the authenticated user.

You should not use the system instruction, either server-side or client-side,
as a means of implementing authorization or security. Additionally, when
supplying the system instruction on the server, you should assume a reasonably
skilled user could extract the system instruction, meaning it should rarely
(if ever) contain truly private or sensitive information.

### Consider Allowing Users to Customize the Instruction

Hashbrown lets you build features into your web app that improve the
productivity of your users. With that in mind, AI-savvy users may benefit
from the
[ability to customize the system instruction](https://koomen.dev/essays/horseless-carriages/).
The ChatGPT app is exemplary in this regard, allowing its users to specify
custom instructions directly in the app.

### Example Use Cases

| Use Case                          | OK?      | Why?                               |
| --------------------------------- | -------- | ---------------------------------- |
| Chat playground / prototyping     | ✅ Yes   | Transparency is the point          |
| LLM-powered search bar            | ✅ Yes   | Prompt = UX logic                  |
| Compliance chatbot                | ❌ No    | Must be server-controlled          |
| AI assistant that autofills forms | ⚠️ Maybe | Depends on if form logic is secure |

### Using a Server-Side System Instruction

To provide a system instruction on the server, first leave the system instruction
empty in your client-side code or use it as an opportunity to document where
it can be found:

```ts
chat = chatResource({
  system: 'Provided on the server',
});
```

Next, in your backend, override the client side system instruction when passing
the completion creation params to your LLM's adapter:

```ts
const params: Chat.Api.CreateCompletionParams = req.body;
const result = OpenAI.stream.text({
  apiKey,
  request: {
    ...params,
    system: `
      <!-- System Instruction -->
    `,
  },
});
```

You can use this as an opportunity to handle more advanced use cases, like providing
parts of the system instruction client-side and server-side, or using a prompt
management library.
