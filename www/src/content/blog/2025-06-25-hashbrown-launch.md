---
title: Introducing Hashbrown
slug: 2025-06-25-Hashbrown-launch
description: Hashbrown is a framework for building generative user interfaces in Angular and React. It is open source and MIT licensed.
tags:
  - story
  - release
team:
  - brian
  - mike
---

**Hot and fresh, cooked with care, and sure to bring joy - Hashbrown is a framework for building generative user interfaces in Angular and React.**

The entire experience of Hashbrown is purposefully designed and built for sparking joy - from the frontend developer to the user.

For us, we want the developer's curiosity and exploration of Hashbrown to grow with eager anticipation of the ways in which the technology of Large Language Models will drastically shift the user experience for web applications.

We want users to experience software through the power of natural language that is not limited by the constraints of existing user interface designs and challenges.

Hashbrown was born out of the pursuit to not only drive innovation and build value, but to have a positive impact on developer's mental health.

Finally, Hashbrown is open source and MIT licensed.
We are open to contributions.

We are eager to see what you fry up.

---

## What is Hashbrown?

Hashbrown is a TypeScript framework that seeks to solve the challenges of integrating LLMs into web applications. Some of these challenges include:

- managing the state of the LLM
- integration with application state and services
- computing structured data from natural language
- exposing components to the LLM
- debugging responses from the LLM
- executing LLM-generated code in the browser

Hashbrown is isomorphic, meaning that it supports server-side rendering. However, Hashbrown is built specifically for frontend web applications. This means that we do not currently solve the challenges for interfacing with Large Language Models for text generation using node, deno, or bun on the server.

---

## What can Hashbrown do today?

Today, Hashbrown is focused on achieving these core principles:

- **Headless**: build your UI how you want
- **Reactive**: Hashbrown is tightly integrated with the reactive architecture provided by Angular and React
- **Platform Agnostic**: use any supported LLM provider
- **[Streaming](/docs/angular/concept/streaming)**: LLMs can be slow, so streaming is baked into the core
- **[Components](/docs/angular/concept/components)**: generative UI using your trusted and tested Angular and React components
- **[Runtime](/docs/angular/concept/runtime)**: safely execute LLM-generated JavaScript code in the client

Today Hashbrown ships with an adapter for four AI providers:

- OpenAI
- Azure OpenAI
- Google Gemini
- Writer

Finally, Hashbrown currently supports text-based communication with Large Language Models.
We anticipate building support for additional media in future releases.

---

## Why is streaming important for Hashbrown?

Large Language Models are excellent at generating predictive text based on training data and context.
Due to the high computation costs associated with this technology, it becomes necessary to stream information to the client over time.
Models vary in terms of capabilities, abilities to complete tasks, and performance.
In many cases, users can begin to gain immediate value from the first bits of information provided.

And so, we wanted this same capability baked into the core of the user experience when building intelligent applications with Hashbrown.
As a result, we're taking the streaming responses from LLMs, normalizing them across different AI providers, then encoding them into a binary response ready to stream to your web application.
We take care of the error handling along the way too, letting you deal with errors in a hopefully pleasant way.

---

## What is tool calling?

With LLMs, tool calling is the ability to expose functions to an LLM that it can "call". We put "call" in quotation marks, because it isn't actually calling the tool. Rather, it generates a special message for the developer that instructs the developer which tool to call, then it is up to the developer to provide the result back to the LLM.

With Hashbrown, you expose functions to the LLM that it can call, and those functions run in the context of your web application. This means you can expose your service layer to the LLM, and the LLM can call those services as part of the task it is executing on.

If you've heard of Model Context Protocol (MCP), then you can kind of think of Hashbrown's tool calling as "MCP but in the browser".

[Learn more about tool calling with Hashbrown](/docs/angular/concept/functions)

---

## What is structured output?

For the most part, you can think of a LLM as text in - text out.
With structured output we can request the LLM respond with structured data.

This means that we can combine the broad and expansive natural language capabilities of LLMs with the capability of aggregation and summarization to output structured data that can be consumed by web applications, APIs, and more.

**What does this mean for a React or Angular developer?**

Let's answer this through some concrete examples.

First, let's take the use case of scheduling a recurring event in calendaring software.
As software developers we can appreciate the complexity of building the user interface, forms, and data collection inputs to enable a user to schedule recurring events.
We can provide shortcuts like, "click here if the event is daily Mon-Fri".
And users appreciate the thoughtful actions that software provides to make their interaction with the software a more pleasant experience.

Now, let's break out of the conventions of traditional user interfaces, forms, and data collection by using the power of natural language.
Using the power of a Large Language Model, we can accept a natural language input from the user, even prompt for clarifications and additional details, before providing a structured data response to the application layer. From there, upon successful validation of the structured data for the recurrent event, we can send the data to our API or persistence layer, and inform the user that the event has been created.

Ok, next, let's briefly examine the use case of filling out an RSVP for a wedding invitation.
As a frontend engineer, my mind starts to build out the navigational elements, workflow, form inputs, and data structures that will likely need to be implemented.
The user will want to provide the number of people attending (or not), perhaps noting if any of the attendees is a child, their dietary restrictions and preferences, along with any contact information should the bride and groom want to follow up with more information.

Again, breaking out of the limitations of existing user interfaces we can begin to craft the prompt for the LLM and the required structured data response that will be handed off to the backend.

We believe that structured output has many use cases through the power of natural language.

And, we haven't even touched on the internationalization, localization, and accessibility of natural language with the power of Large Language Models to build intelligent web applications.

[Learn more about structured output with Hashbrown](/docs/angular/concept/structured-output)

---

## What is Skillet?

Today, Zod is the obvious standard in TypeScript for creating the schema necessary to tap into LLM's structured outputs and tool calling features. The problem with Zod, though, is that Zod's mission is not to create a schema language for LLMs, but to create a schema language that models 100% of TypeScript's type system.

The reality, though, is that LLMs understand maybe 5% of Zod's schema capabilities. If you go read Google's list of supported schema, it supports maybe 10-15 different kinds of types. Like, you're not even guaranteed that if you provide a min/max to a number, it'll adhere to it.

So that made us want to build our own schema language. Skillet is optimized for LLMs. The types that you can express with Skillet mirror the common set of capabilities across LLM providers. You are much less likely to get in a situation with Skillet where you express a type that you think is working, but is being silently ignored by the LLM.

Additionally, we knew we wanted to do streaming structured data. The idea is that as the LLM generates JSON, we aim to parse as much of it as possible to provide results to our UIs. Other solutions to this problem were really incomplete in our opinion, where the developer had very little control over how the streaming parser works. With Skillet, the developer is always in control over which parts of their schema can stream, and how it streams.

Lastly, as part of our LLM optimizations, we sometimes serialize schemas into JSON Schema that is easier for the LLM to generate, and then turn it into the right result on the developer's behalf. Discriminated unions are a good example of this.

[Learn more about skillet](/docs/angular/concept/schema)

---

## What is generative UI?

A Generative UI is an interface that an AI model assembles and tailors in real time, based on the user's goals and context, rather than relying on a structured, hand-authored user interface.

LLMs are really great at generating three kinds of text:

- Natural language
- Structured JSON
- Code

Hashbrown asks:

> If you can generate natural language, structured data, and code, what kinds of user interfaces might we build in the future?

And truthfully, we don't know! Building Hashbrown is the first part of our journey to answering this question.

At the core of generative user interfaces is exposing your application's **trusted**, **tested**, **compliant**, and **authoritative** components to a large language model (LLM) that is capable of rendering the exposed components into the web application at runtime.

Generative UI with Hashbrown is building on top of Skillet and the LLM's ability to generate structured data. We're essentially asking the LLM to write JSON that describes a UI, then using Skillet to parse that JSON as it is being generated, and then passing all of the metadata you provide to a specialized renderer that creates the user interface at runtime.

[Learn more about generative UI](/docs/angular/concept/components)

---

## What is the JS runtime?

Hashbrown ships with a JavaScript runtime for safe execution of LLM-generated code in the client.

If you have used ChatGPT, you've likely noticed that it will sometime generate Python code that is executed in their built-in code interpreter functionality (or runtime). This approach is useful for:

- Data analysis, mutation, and transformation
- Dynamic visualizations
- Process automation and task execution

Let's frame this within a concrete example (which we are experimenting with today).

Traditional user interfaces for data exploration and visualization are built within the constraints of the interface between the data, application, and visualization rendering layers. We build data mutation and transformation pipelines for data aggregation, summation, and computation. Then, we combine application services and user input to customize and render data visualizations in the browser. This is all built based on the predetermined requirements and navigational capabilities.

Now, imagine simply asking "which products had the highest sales last quarter?", "show me a bar chart of sales volume by quarter for the previous 3 years", or "add a trend line to the chart to compare revenue with transaction volume", or "put the legend on the bottom and make the bar chart visually brighter and the regression line subtle".

The JS runtime by Hashbrown enables your web application to execute LLM-generated code to achieve these results - let the LLM write code that transforms the data in the client to meet the needs of the request, plus write the code to customize the display and rendering of the chart. Using our runtime, you can expose asynchronous functions that are executed synchronously within a C-based WASM runtime.

[Learn more about the JS runtime](/docs/angular/concept/runtime)

---

## How do I debug with Hashbrown?

Whether you are new to AI engineering or are beginning your journey of building intelligent web applications, it is critical to have the insight and tools necessary to debug and introspect.

Hashbrown ships with built-in support for streaming the internal state of Hashbrown to the [redux devtools](https://chromewebstore.google.com/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd?pli=1).

We stream each chunk and action from the LLM and Hashbrown into the devtools, enabling you to have a deep understanding of the sequencing of messages between your application and the LLM.

---

## What LLM providers do you support?

Using the adapter pattern, it is relatively easy to add new LLM providers. Today, we support OpenAI, including Azure, Google's Gemini models, and the Palmyra models from Writer.

Based on our experience, OpenAI's models are superior at instruction following, tool calling, and generating structured data. They support the most capabilities, and often need the least amount of prompting compared to other models.

---

## Angular and React Support

We support Angular v20 and React v19 today.

---

## Why build Hashbrown?

As developers and technologists many of us have experienced the power of large language models, both in our daily lives and in the work we do.

Mike and I began adopting the use of generative AI in our workflows when GitHub Co-Pilot was first introduced.
As software engineers, we were familiar with the assistive nature of intellisense. But, this just felt different. CoPilot introduced a new level of acceleration in our daily tasks.

Next, ChatGPT 3.5 was released in November 2022. This release exploded into our lives as we were both traveling abroad. Mike and I (Brian) had been invited to deliver the closing keynote at NG Rome in the fall. We were both traveling with our significant other and saw just how powerful and insightful a Large Language Model can be, especially when asking for restaurant recommendations, how to visit and navigate foreign cities, learn about local traditions and food, and more. ChatGPT 3.5 seemed to provide guidance and insight, and yes, it made up some facts or got things wrong, but it provided a glimpse into the future of technology and AI.

As a result, Mike and I have been experimenting with AI, both broadly in our careers and our lives as well as attempts at integrating AI into frontend web applications, for about two and a half years. First, Mike built a prototype of a journaling app called Idly, for helping you track your mental health. Then we built our first product, [Polaris](https://getpolaris.ai), which while it didn't end up taking off, did serve as an educational exercise in building out suggestions & completions with LLMs. After getting more and more experience, we started building out generative UI features into our client projects.

And so in a way, we've built something like Hashbrown at least a half dozen times. That felt like a strong signal that there was something to the idea of integrating the power of LLMs into web applications, and in March, we began developing Hashbrown.

---

## How does LiveLoveApp support enterprises?

The team at [LiveLiveApp](https://liveloveapp.com) are industry leaders in app design and development, focused on helping companies build the next generation of banking, finance, and accounting applications.

We can't stop thinking about how AI changes the way people explore, visualize, and act on complex information—all through the power of natural language.

LiveLoveApp provides AI Engineering consulting services from the team who build Hashbrown.

---

## What comes next?

Going forward we are focused on:

- **API refinement**: focused on simplicity, clarity, and brevity.
- **JS Runtime**: tightly coupling of the JS runtime to the core Hashbrown experience.
- **More Samples**: we continue to build and expand our sample applications.
- **Increased Awareness**: help us to get the word out as we increase the awareness of Hashbrown and generative UI.
- **Exploration**: join us as we continue to explore the future of intelligent web applications.
