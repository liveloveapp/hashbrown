---
title: 'Using Hashbrown with CopilotKit: Hashbrown React Docs'
meta:
  - name: description
    content: "Render a CopilotKit agent's streamed answers as trusted React components with Hashbrown UI kits, createUiJsonSchema, and the streaming JSON parser."
---

# Using Hashbrown with CopilotKit

CopilotKit runs the agent and the chat. Hashbrown can render the agent's answers as your own React components, streaming them in as the message arrives.

The responsibilities split cleanly:

- **CopilotKit** owns the chat surface, the runtime connection, and the agent.
- **The agent** answers with a JSON object that follows your UI kit's schema.
- **Hashbrown** builds that schema from your components, parses the message as it streams, and renders only the components you exposed.

The agent never sends HTML or code. Anything it emits that isn't a component in your kit, or whose props don't match the component's schema, isn't rendered.

---

## 1. Install Packages

<hb-code-example header="terminal">

```sh
npm install @copilotkit/react-core @hashbrownai/core @hashbrownai/react
```

</hb-code-example>

You don't need a Hashbrown provider package or a Hashbrown server endpoint. CopilotKit's runtime talks to the model.

---

## 2. Define the Components Once

Write each component's contract as a `UiComponentDefinition`: its name, a description for the model, and a Skillet schema for each prop. The browser and the agent's build step both import this file.

<hb-code-example header="dashboard-components.ts">

```ts
import { prompt, s, type UiComponentDefinition } from '@hashbrownai/core';

export const metricDefinition = {
  name: 'Metric',
  description: 'A KPI card with a label and a formatted value.',
  props: {
    label: s.string('The metric label'),
    value: s.string('The formatted value, such as $1.2M'),
  },
} satisfies UiComponentDefinition;

export const barChartDefinition = {
  name: 'BarChart',
  description: 'A vertical bar chart.',
  props: {
    title: s.string('Chart title'),
    data: s.array(
      'One entry per bar',
      s.object('Bar', {
        label: s.string('Bar label'),
        value: s.number('Bar value'),
      }),
    ),
  },
} satisfies UiComponentDefinition;

export const dashboardDefinitions = [metricDefinition, barChartDefinition];

export const dashboardExamples = prompt`
  <ui>
    <Metric label="Total revenue" value="$1.2M" />
    <BarChart
      title="Monthly revenue"
      data=${[
        { label: 'Oct', value: 350000 },
        { label: 'Nov', value: 400000 },
      ]}
    />
  </ui>
`;
```

</hb-code-example>

Pass arrays and objects in examples with `${}`. A quoted attribute is a string, so `data='[...]'` would fail validation against `s.array(...)`.

---

## 3. Give the Agent the Schema

The agent has to answer with `{ "ui": [...] }` in exactly the shape your kit expects. Don't copy that shape into the prompt by hand. Generate it with `createUiJsonSchema()`, which returns the same JSON Schema Hashbrown itself sends to a model for this kit, examples included.

If the agent is written in JavaScript or TypeScript, import it directly. If it isn't, write it to a file as part of your build:

<hb-code-example header="scripts/write-ui-schema.ts">

```ts
import { writeFileSync } from 'node:fs';
import { createUiJsonSchema } from '@hashbrownai/core';
import {
  dashboardDefinitions,
  dashboardExamples,
} from '../src/dashboard-components';

const schema = createUiJsonSchema({
  components: dashboardDefinitions,
  examples: dashboardExamples,
});

writeFileSync('agent/ui-schema.json', JSON.stringify(schema, null, 2));
```

</hb-code-example>

Then require that schema as the model's structured output. With OpenAI that is a `json_schema` response format. This LangGraph agent, served through CopilotKit, loads the file:

<hb-code-example header="agent/dashboard_agent.py">

```python
import json
from pathlib import Path

from copilotkit import CopilotKitMiddleware
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

ui_schema = json.loads((Path(__file__).parent / "ui-schema.json").read_text())

graph = create_agent(
    model=ChatOpenAI(
        model="gpt-5.4",
        model_kwargs={
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "ui", "strict": True, "schema": ui_schema},
            }
        },
    ),
    tools=[],
    middleware=[CopilotKitMiddleware()],
    system_prompt="You build sales dashboards. Answer with UI components.",
)
```

</hb-code-example>

Structured output keeps the whole message valid JSON. If your model or framework can't enforce a schema, put the schema in the system prompt and ask for one JSON object with no other text. The parser renders nothing when the message starts with prose or a code fence.

---

## 4. Render the Agent's Messages

Build a kit from the same definitions and examples, then parse each assistant message with `useJsonParser()` and render it with `kit.render()`:

<hb-code-example header="DashboardMessage.tsx">

```tsx
import { exposeComponent, useJsonParser, useUiKit } from '@hashbrownai/react';
import { BarChart } from './BarChart';
import { Metric } from './Metric';
import {
  barChartDefinition,
  dashboardExamples,
  metricDefinition,
} from './dashboard-components';

const components = [
  exposeComponent(Metric, metricDefinition),
  exposeComponent(BarChart, barChartDefinition),
];

export function DashboardMessage({ content }: { content: string }) {
  const kit = useUiKit({ components, examples: dashboardExamples });
  const { value, error } = useJsonParser(content, kit.schema);

  if (error) {
    return <p>{content}</p>;
  }

  return value ? <div className="dashboard">{kit.render(value)}</div> : null;
}
```

</hb-code-example>

`useJsonParser()` takes the whole message so far and only parses what was appended since the last render. Each component appears once its props are complete, so the first card renders while the chart's data is still streaming. If the message turns out not to be JSON, `error` is set and the message is shown as text.

Declare `components` outside the React component, or memoize it, so the kit isn't rebuilt on every render.

Use the component as CopilotKit's markdown renderer for assistant messages. CopilotKit passes it the message `content` as it streams and keeps its own toolbar and tool-call views around it:

<hb-code-example header="Dashboard.tsx">

```tsx
import { CopilotChat, CopilotKit } from '@copilotkit/react-core/v2';
import '@copilotkit/react-core/v2/styles.css';
import { DashboardMessage } from './DashboardMessage';

export function Dashboard() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="dashboard">
      <CopilotChat
        messageView={{
          assistantMessage: { markdownRenderer: DashboardMessage },
        }}
      />
    </CopilotKit>
  );
}
```

</hb-code-example>

---

## 5. Integration Guidelines

- Keep one definitions file and generate the agent's schema from it in your build. If the browser's kit and the agent's schema drift apart, the parser rejects the agent's output.
- Pass the same `examples` to `useUiKit()` and `createUiJsonSchema()`. They're part of the schema.
- Give the model components, not layout primitives. A few well-described components produce better UI than a generic grid with many options.
- Model chart and table data as real arrays with `s.array()`. The parser streams arrays item by item.
- Use CopilotKit tools for actions and reading app state. Use the UI kit for what the agent shows the user.
