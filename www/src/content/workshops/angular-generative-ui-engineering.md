---
title: Building Generative UIs with Angular
description: Discover how to turn natural language into working UIs, intelligent forms, and agentic workflows with Hashbrown’s generative AI Angular resources.
active: true
order: 2
---

# Building Generative UIs with Angular

<p class="subtitle">Discover how to turn natural language into working UIs, intelligent forms, and agentic workflows with Hashbrown’s generative AI Angular resources.</p>

<div style="position: relative; padding-bottom: 64.90384615384616%; height: 0;"><iframe src="https://www.loom.com/embed/024771a5020c4651af7240a6cdba9956?sid=06b1a102-5c15-45da-a8a3-486977bf458f" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe></div>

## 1. The Basics of AI Engineering

Learn how to use Large Language Models (LLMs) in your Angular app using Hashbrown.  
By the end of this section, you will be able to choose the right model, interact with it, and measure its performance.

You will learn how to:

1. Interact with LLMs, including managing multi-turn conversations, tool calling, and error handling.
2. Choose a model based on speed, cost, reliability, and quality.
3. Work with model APIs: tokens, temperature, structured outputs, and verbosity.
4. Measure token usage and cost for your application.
5. Write effective system instructions to shape model behavior.
6. Understand the differences between AI vendors like OpenAI, Google Gemini, Anthropic, Azure, Writer, Ollama, and more.

**Demo:** Build a simple "Ask Anything" text completion widget that responds to user queries while tracking token usage.

## 2. Simplify Forms and Provide Suggestions

Learn how to generate structured data from natural language prompts and provide intelligent suggestions using `@hashbrownai/angular`'s resource APIs.

By the end of this section, you will be able to replace multi-input forms with natural language inputs and offer dynamic suggestions to your users.

You will learn how to:

1. Use the @hashbrownai/angular!completionResource:function function to generate text completions from user input.
2. Use the @hashbrownai/angular!structuredCompletionResource:function function to generate structured data ready for your web app.
3. Refactor a multi-input form into a single text input that accepts natural language and outputs structured data.
4. Provide navigation and task completion suggestions based on user actions.

**Demo:** Convert a traditional "expense form" into a single text field where users can type things like "Lunch with client, $45 at Café Rio," and the app parses it into structured data.

## 3. UI Chatbots with Tool Calling

Learn to create a chatbot in your Angular app with an AI that can interact directly with your app state and services.

By the end of this section, you will be able to connect a chatbot to your Angular state, service layer, and even render Angular components as AI responses.

You will learn how to:

1. Use the @hashbrownai/angular!chatResource:function function to stream text responses into your Angular app.
2. Upgrade to the @hashbrownai/angular!uiChatResource:function function to let the model render Angular components.
3. Use the @hashbrownai/angular!createTool:function function to allow the model to interact with Angular component state and call your Angular service layer.
4. Integrate with an MCP server to call remote tools.

**Demo:** Build a smart home chatbot where users can type "turn off the lights in the living room" or "create a scene that turns the kitchen lights on" and the app handles these requests, generating detailed UIs in response.

## 4. Advanced Generative UI

AI can be more than chatbots. In this final section, we will explore advanced topics in generative UI design. By the end of this section, you will be able to experiment with dynamic, agentic interfaces powered by LLMs.

You will learn how to:

1. Use the @hashbrownai/angular!createRuntime:function and @hashbrownai/angular!createRuntimeFunction:function functions to create a JavaScript runtime for executing LLM-authored scripts.
2. Build a UI that lets users perform batch or bulk operations with natural language.
3. Apply design strategies and patterns for prompting, generating, and remixing UIs.
4. Explore "prompts as props" to create agentic flows where LLMs collaborate with other LLMs to generate user interfaces.

**Demo:** Create a charting UI where a user types "show me ingredient trends over the last 30 days" and the AI generates the chart dynamically.

## Prerequisites

- Confidence using Angular with signals and resources that call remote APIs.
- Basic familiarity with TypeScript.
- No prior AI integration experience required. You’ll learn everything in this workshop.

## Schedule

- **Start:** 8 am PT / 11 am ET
- **End:** 3 pm PT / 6 pm ET
- **Breaks:** two 15-minute breaks and one 30-minute lunch break

Morning: Foundations (Sections 1 & 2)  
Afternoon: Chatbots and Advanced Generative UI (Sections 3 & 4)
