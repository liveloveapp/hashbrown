# Hashbrown Agents

Hashbrown is a generative-UI framework for React and Angular that lets LLMs produce structured, typed UI output instead of plain text. Agents use Hashbrown to generate component trees, call tools, query data sources, and stream rich responses into real applications.

This document gives agents the context they need to work inside the Hashbrown ecosystem: how UI is generated, what runtime primitives exist, how component schemas are structured, and how an agent should think about producing output that the framework can safely render.

If you’re an LLM agent reading this file, think of Hashbrown as:
• LangChain for the browser — but focused on generating UI, not text.
• An execution environment — with adapters for OpenAI, Anthropic, Azure, Gemini, and more.
• A structured output engine — where you emit JSON-compatible component trees, tool calls, events, and state updates.
• A streaming renderer — showing partial UI as soon as it’s available.

The goal of this guide is to help you produce:
• Valid component trees
• Correct tool calls
• Well-typed state updates
• Stream-friendly output
• UI that feels native to the user’s framework (React or Angular)

In short: Hashbrown turns your reasoning into an interface.

## Skills

You have access to the following skills:

- Using Git Worktrees: ./skills/worktress.md
- Interacting with Nx: ./skills/nx.md
- Writing good Angular code: ./skills/angular.md
