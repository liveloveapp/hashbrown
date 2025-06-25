---
title: The launch of hashbrown
slug: 2025-06-25-hashbrown-launch
description: hashbrown is a framework for building generative user interfaces in Angular and React. It is open source and MIT licensed.
tags:
  - stories
team:
  - brian
  - mike
---

**Hot and fresh, cooked with care, and sure to bring joy - hashbrown is a framework for building generative user interfaces in Angular and React.**

The entire experience of hashbrown is purposefully designed and built for sparking joy - from the frontend developer to the user.

For us, we want the developer's curiosity and exploration of hashbrown to grow with eager anticipation of the ways in which the technology of Large Language Models will drastically shift the user experience for web applications.

We want users to experience software through the power of natural language that is not limitated by the constraints of existing user interface designs and challenges.

hashbrown was born out of the pursuit to not only drive innovation and build value, but to have a positive impact on developer's mental health.

Finally, hashbrown is open source and MIT licensed.
We are open to contributions.
We are eager to hear what you build.

---

## What is hashbrown, and what made you want to build it?

We've been experimenting with generative UI for about two and a half years. First, Mike built a prototype of a journaling app called Idly, for helping you track your mental health. Then we built our first product, Polaris, which while it didn't end up taking off, did serve as an educational exercise in building out suggestions & completions with LLMs. After getting more and more experience, we started building out generative UI features into our client projects.

And so in a way, we've built something like hashbrown at least a half dozen times. That felt like a strong signal that there was something to this idea of generative UI, and in March, we began developing hashbrown.

---

## What is generative UI?

Ben and Mike worked together at a previous startup in the industrial IoT space, and that was likely the first time we engaged with machine learning. Before LLMs, machine learning meant amassing a large dataset, training these ML models, and then going through a complicated process to get them deployed into a production environment. It made building ML-powered features extremely expensive.

With LLMs, they've essentially trained one big model on ALL of the things. What this means is that, for a wide variety of use cases, you can tap into an LLM and get really good ML outputs while skipping that expensive training step. Suddenly, features like predictions & suggestions, which were reserved for the really big companies that could afford it, are accessible to all developers.

hashbrown lets developers easily tap into LLMs to build apps. You can use it to build suggestions and completions, but we think you can take this even further.

LLMs are really great at generating three kinds of text:

- Natural language
- Structured JSON
- Code

hashbrown asks:

> if you can generate these outputs, what kinds of UIs might we build in the future? And truthfully, we don't know! Building hashbrown is the first part of our journey to answering this question.

---

## How does hashbrown handle streaming from LLMs differently than other tools?

We've been developing internal experience with streaming data for a whole different use case: large datasets. Think of a huge datatable, like the one you might feed into AG Grid. We've been improving the experience of Ag Grid implementations for our consulting clients by tapping into streaming, allowing us to display rows of data in those grids as fast as possible.

So when it came time to build hashbrown, we knew we wanted to do the heavy lifting on behalf of the developer. We're taking the streaming responses from LLMs, normalizing them across different AI providers, then encoding them into a binary response ready to stream to your own web apps. We take care of the error handling along the way too, letting you deal with errors in a hopefully pleasant way.

---

## Can you explain how function calling works in hashbrown and what kinds of real-world use cases it unlocks?

With LLMs, function calling is the ability to expose functions to an LLM that it can then "call". We put "call" in quotation marks, because it isn't actually calling the tool. Rather, it generates a special message for the developer that instructs the developer which tool to call, then it is up to the developer to provide the result back to the LLM.

We've all been hearing all of this buzz around MCP, and if you're familiar with it, you can kind of think of hashbrown's tool calling as "MCP but in the browser". With hashbrown, you expose functions to the LLM that it can call, and those functions run in the context of Angular's dependency injection. This means you can expose your service layer to the LLM, and the LLM can call those services as part of its flows.

---

## What's the story behind Skillet (your custom schema system)?

As mentioned above, we've built a lot of different apps with LLMs and Zod is the obvious standard in TypeScript for creating the schema necessary to tap into LLM's structured outputs and tool calling features. The problem with Zod, though, is that Zod's mission is not to create a schema language for LLMs, but to create a schema language that models 100% of TypeScript's type system.

The reality, though, is that LLMs understand maybe 5% of Zod's schema capabilities. If you go read Google's list of supported schema, it supports maybe 10-15 different kinds of types. Like, you're not even guaranteed that if you provide a min/max to a number, it'll adhere to it.

So that made us want to build our own schema language. Skillet is optimized for LLMs. The types that you can express with Skillet mirror the common set of capabilities across LLM providers. You are much less likely to get in a situation with Skillet where you express a type that you think is working, but is being silently ignored by the LLM.

Additionally, we knew we wanted to do streaming structured data. The idea is that as the LLM is generating JSON, we want to parse as much of that JSON as we can to provide results to our UIs. Other solutions to this problem were really incomplete in our opinion, where the developer had very little control over how the streaming parser works. With Skillet, the developer is always in control over which parts of their schema can stream, and how it streams.

Lastly, as part of our LLM optimizations, we sometimes serialize schemas into JSON Schema that is easier for the LLM to generate, and then turn it into the right result on the developer's behalf. Discriminated unions are a good example of this.

---

## How do you expose Angular components to the LLM?

You expose a component to the LLM when building UI chat or UI completions. It's building on top of Skillet and the LLM's ability to generate structured data. We're essentially asking the LLM to write JSON that describes a UI, then using Skillet to parse that JSON as it is being generated, and then passing all of the metadata you provide in exposeComponent to a specialized renderer that creates the UI on the fly.

---

## What LLM providers do you support?

We've built it in a way that makes it relatively easy to add new LLM providers. Today, we support OpenAI, Google's Gemini models, and the Palmyra models from Writer.

We chose OpenAI because, based on our experience, their models are superior at instruction following, tool calling, and generating structured data. They support the most capabilities, and often need the least amount of prompting compared to other models. Additionally, we see a lot of Angular developers working inside companies that have fully embraced .NET. If you're already in the .NET and Azure world, you can consume OpenAI's models through Azure's AI Foundry, which we also support out of the box.

Google's Gemini models were a no-brainer second pick. If you're an Angular developer not using .NET, you might be using Firebase or GCP. We want to meet Angular developers where they are, and we think these two model families cover a vast majority of use cases.

Our third pick, Writer, is totally enterprise focused. They have tighter controls on including copyrighted content in their training data, offer companies data retention policies, and have a full RAG solution built into it. We want to bring hashbrown into the enterprises that are attracted to these qualities.

---

## Angular and React Support

We support Angular and React today. We are Angular first, but so much of our consulting business has actually been in React, making it a good second choice. We'd love to tackle Vue next. It's already been requested a handful of times.

Can hashbrown be used in existing enterprise Angular apps, or is it better suited for greenfield projects?
It's really easy to drop hashbrown into an existing app. You can start small, maybe building a tab-to-complete feature for a heavily trafficked input. Then level it up with some smarter predictions and suggestions.

With that being said, we think generative UI is so powerful that greenfield apps embracing hashbrown will look totally different from the apps we are used to using today.

---

## What are some surprising use cases you've seen hashbrown used for?

Right now, we are feeling really excited about how hashbrown compliments RAG. With most RAG solutions, you're relying on the LLM to generate a full text response to a question. However, those text responses might have subtle hallucinations in them that are hard to detect.

With hashbrown, instead of asking the LLM to generate a full text response, you're often asking it to recall much simpler pieces of information, like the UUID of a piece of information it's referencing. Insert anecdote about the RAG approach for AI Engineer World's Fair, and how it kept it from hallucinating talks that didn't exist.

---

## How do you help teams build genuinely useful experiences?

By being honest about it. We've been building these features for a few years now, and we've been intentional with hashbrown to support the use cases that we think are really great.

That's why hashbrown focuses on the friendliness. If you've used Github Copilot or ChatGPT, you know that these AI tools can accelerate software engineering workflows. Maybe it's only by 20% or whatever, but the gain is real. hashbrown asks: why not use the same approach to speed up the workflows that we are building in our own apps? Why not pass these productivity gains on to the users of our software?

We really think hashbrown can improve the usability and accessibility of apps.

---

## What does enterprise support from LiveLoveApp look like in practice?

It comes in three different flavors:

We can quickly accelerate your team on AI engineering. We're learning so much about it every day with our clients, and we've bundled those learnings up into an AI engineering sprint. We'll come into your company for a week, train all of the Angular engineers on staff from basic AI concepts to how to build with generative UI, and then we embed with your team to ship a feature to production.
If a week isn't enough time, we can come on board for longer in a traditional consulting model, where we help you build AI-powered apps.
The third option is dedicated hashbrown support. For now, that means guaranteed SLAs on response times for tickets, prioritized bug fixes, and the opportunity to influence our product roadmap. After we hit v1, our enterprise support will include dedicated LTS releases.
