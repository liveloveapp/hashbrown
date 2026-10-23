---
title: 'Introduction: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Build generative user interfaces with your own Angular components.'
---

# Introduction

Hashbrown is an open source framework for building generative user interfaces in Angular. You give the model a set of components, describe the props they accept, and render its response using those components.

Let's start with something small: a `WelcomeCard` with a title and a message.

<hb-docs-demo demo="welcome-card">
</hb-docs-demo>

## Your components, with model-generated props

You write the markup, styles, and behavior. The model chooses among the components you expose and supplies values that match their schemas. Hashbrown validates those values and renders the result in your app.

That gives us a useful boundary: the model can compose the UI we make available, while the application owns what those components can do.

## What runs where?

The Angular application owns rendering, chat state, and browser-side tools. Your server keeps provider credentials and selects the model. Hashbrown connects the two through a streaming endpoint.

You can use Hashbrown for text conversations, structured data, and decisions as well. Start with [Choosing an API](/docs/angular/start/overview) when you already know the kind of output you need.

## Build your first card

The [Quickstart](/docs/angular/start/quick) walks through the complete example: a server endpoint, a trusted component, and a button that generates the card.

Once that works, continue with [Messages and turns](/docs/angular/concept/ai-basics) to see how a conversation is represented, or [Exposing components](/docs/angular/concept/components) to build a richer UI.

For a larger example, explore the [ATC application](/docs/angular/start/sample). It combines generative UI, browser-side tools, streaming, and decisions in a working application.
