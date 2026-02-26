# LangGraph Architecture Guidelines

## Overview

This document outlines architecture patterns for building **LangGraph-based multi-agent systems** using a planning agent pattern where a router agent orchestrates specialized agents to gather information before synthesizing a final response.

### Key Technologies

- **LangGraph**: State machine framework for building agentic workflows
- **LangChain**: Framework for building LLM applications
- **TypeScript**: Type-safe development
- **Zod**: Schema validation and type inference

### Architecture Principles

1. **Separation of Concerns**: Clear boundaries between routing, retrieval, and synthesis
2. **Type Safety**: Comprehensive TypeScript types with Zod schema validation
3. **Modularity**: Independent, reusable agents and tools
4. **State-Driven**: Centralized state management with immutable updates
5. **Extensibility**: Easy to add new agents, tools, or data sources

---

## Architecture Patterns

### Planning Agent Pattern

The system uses a **planning agent pattern**:

```
User Query → Router Agent (plans steps) → Step Queue →
Specialized Agents (execute) → State Accumulation →
Router (re-evaluates) → Finalize Agent (synthesizes)
```

### Key Patterns

1. **Router-Executor**: Router plans, specialized agents execute
2. **State Accumulation**: Agents add to shared state without overwriting
3. **Conditional Routing**: Graph routes based on step queue
4. **Context Injection**: Agents receive relevant state via `context` parameter
5. **Structured Responses**: All agents use Zod schemas for type-safe outputs

---

## Directory Structure

```
src/
├── agents/          # Agent definitions (LLM + tools + prompts)
├── nodes/           # Graph node implementations
├── edges/           # Conditional edge functions
├── graphs/          # Graph assembly and compilation
├── models/          # State schemas and types
└── tools/           # Reusable tool definitions
```

### Directory Responsibilities

- **`agents/`**: Define LLM agents with models, prompts, tools, and response schemas
- **`nodes/`**: Implement graph node functions that invoke agents and update state
- **`edges/`**: Define conditional routing logic
- **`graphs/`**: Assemble and compile the LangGraph state machine
- **`models/`**: Define Zod schemas for state and domain objects
- **`tools/`**: Create reusable LangChain tools for external APIs and utilities

---

## Core Components

### 1. State Schema

The state schema defines the complete graph state using Zod. It extends `MessagesZodState` for conversation history and adds custom fields for retrieval results and step tracking.

**Key Principles:**

- Use Zod schemas for all state properties
- Export individual schemas for reuse
- Use `.describe()` for documentation
- Make fields nullable when appropriate
- Use arrays for accumulating results

**Example:**

```typescript
export const GraphStateSchema = z.object({
  messages: MessagesZodState.shape.messages,
  retrieval: z.object({
    // Domain-specific retrieval results
    airport: z.array(Airport),
    phak: z.array(z.string()),
    poh: z.array(z.string()),
    weather: z.array(WeatherSegment),
  }),
  completed: z.array(Step),
  steps: z.array(Step),
});
```

**Step Schema:**

The Step schema includes the target node name:

```typescript
export const Step = z.object({
  prompt: z.string().describe('The prompt for the step'),
  reason: z.string().describe('The reason for selecting the next step'),
  step: z
    .enum(['phak', 'poh', 'airport', 'weather', 'end'])
    .describe('The step to execute or the end of the graph'),
});
```

**Note:** The router agent's responseFormat only includes `['phak', 'poh', 'airport', 'weather']` - it does not return 'end'. Instead, it returns an empty steps array when complete.

### 2. Agents (`agents/*.ts`)

Agents are LLM-powered components that use `createAgent` from LangChain. Each agent has:

- **Model**: ChatOpenAI instance with specific model and reasoning settings
- **Context Schema**: Zod schema defining what context the agent receives
- **Response Format**: Zod schema for structured output
- **System Prompt**: Detailed instructions for the agent's role
- **Tools**: Array of LangChain tools the agent can use

**Agent Structure:**

```typescript
const model = new ChatOpenAI({
  model: 'gpt-5', // or 'gpt-5-mini' for simpler tasks
  reasoning: { effort: 'minimal' }, // or 'low' for more complex tasks
  apiKey: process.env.OPENAI_API_KEY,
});

const contextSchema = z.object({
  // Context properties
});

const responseFormat = z.object({
  // Structured output schema
});

const systemPrompt = `
  // Detailed instructions
`;

export const agent = createAgent({
  contextSchema,
  model,
  responseFormat,
  systemPrompt: systemPrompt.trim(),
  tools: [
    /* tool list */
  ],
});
```

**Best Practices:**

- Use appropriate model sizes based on task complexity:
  - `gpt-5` for complex reasoning tasks (router, phak, poh, finalize)
  - `gpt-5-mini` for simpler retrieval tasks (airport, weather)
- Set reasoning effort based on task complexity:
  - `minimal` for simple tasks (router, airport, weather)
  - `low` for moderate complexity (phak, poh)
- Provide detailed, structured system prompts
- Include examples in prompts when helpful
- Use context schemas to limit what agents see
- Always define response formats for structured outputs

### 3. Nodes (`nodes/*.ts`)

Nodes are graph execution units that:

1. Extract the current step from state
2. Invoke the corresponding agent with context
3. Update state with results
4. Remove completed step from queue

**Node Pattern (Specialized Agents):**

```typescript
export async function nodeName(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const step = state.steps[0];

  const result = await agent.invoke(
    { messages: [{ role: 'human', content: step.prompt }] },
    {
      context: {
        /* relevant state */
      },
    },
  );

  const steps = state.steps.slice(1);

  if (!result.structuredResponse) {
    return { steps };
  }

  return {
    steps,
    completed: [...(state.completed ?? []), step],
    retrieval: {
      ...(state.retrieval ?? {}),
      // Accumulate results
    },
  };
}
```

**Router Node Pattern:**

The router node has special logic to handle existing steps:

```typescript
export async function router(state: GraphState): Promise<Partial<GraphState>> {
  // Early return if steps already exist (from previous router invocation)
  if (state.steps && state.steps.length > 0) {
    return {};
  }

  const result = await agent.invoke(
    { messages: state.messages },
    {
      context: {
        /* all retrieval state */
      },
    },
  );

  return {
    steps: result.structuredResponse.steps,
  };
}
```

**Key Principles:**

- Always return `Partial<GraphState>` (only changed fields)
- Pop the first step from queue after processing
- Add step to `completed` array
- Accumulate results (don't overwrite)
- Handle missing structured responses gracefully
- Use spread operators for immutable updates
- Implement deduplication when accumulating arrays (e.g., filter by unique IDs)

### 4. Edges (`edges/next.ts`)

Edges define conditional routing logic. The `next` function determines which node to execute next based on the step queue.

**Edge Pattern:**

```typescript
export function next(state: GraphState): string {
  const steps = state.steps;

  if (steps.length === 0) {
    return END; // Graph terminates when no steps remain
  }

  return steps[0].step; // Route to the next step's target node
}
```

**PATH_MAP for Type Safety:**

The graph uses a PATH_MAP constant for type-safe routing:

```typescript
const PATH_MAP = {
  airport: 'airport' as const,
  phak: 'phak' as const,
  poh: 'poh' as const,
  weather: 'weather' as const,
  __end__: '__end__' as const,
};
```

**Key Principles:**

- Return node name as string or `END` constant
- Check step queue length
- Return first step's target node
- Use `PATH_MAP` in graph for type safety

### 5. Graph

The graph assembles nodes and edges into a state machine. All specialized nodes route back to the router, which uses conditional edges to route to the next step based on the step queue.

**Graph Structure:**

```typescript
const graph = new StateGraph(GraphStateSchema)
  .addNode('airport', airport)
  .addNode('phak', phak)
  .addNode('poh', poh)
  .addNode('router', router)
  .addNode('weather', weather)
  .addEdge(START, 'router')
  .addEdge('airport', 'router')
  .addEdge('phak', 'router')
  .addEdge('poh', 'router')
  .addEdge('weather', 'router')
  .addConditionalEdges('router', next, PATH_MAP);
```

**Note:** When the step queue is empty, the graph ends (returns `END`). A finalize node exists in the codebase but is not currently connected to the graph. The router agent returns an empty steps array when information is complete, causing the graph to terminate.

### 6. Tools (`tools/*.ts`)

Tools are LangChain tool definitions that wrap external APIs or utilities.

**Tool Pattern:**

```typescript
export const toolName = tool(
  async ({ param }: { param: string }) => {
    // Implementation
    return result;
  },
  {
    name: 'tool_name',
    description: 'Clear description of what the tool does',
    schema: z.object({
      param: z.string().describe('Parameter description'),
    }),
  },
);
```

**Key Principles:**

- Use descriptive names (snake_case)
- Provide clear descriptions
- Validate inputs with Zod
- Handle errors gracefully
- Return structured data
- Use appropriate error messages

**Special Tool: get_state**

The `get_state` tool allows agents to read graph state via context injection.

---

## Data Flow

### Request Flow

1. User message → added to `messages` in state
2. Graph starts at router node
3. Router agent reads state, analyzes query, generates step list
4. Conditional edge routes to first step's target node
5. Specialized agent executes: receives prompt, uses tools, returns structured response
6. Node updates state: removes step from queue, adds to `completed`, accumulates results
7. Graph routes back to router
8. Router re-evaluates: if steps array is empty, graph terminates (returns END); otherwise routes to next step
9. Response returned to user (via LangGraph's message handling)

**Note:** The finalize agent exists but is not currently connected to the graph. When the router returns an empty steps array, the graph terminates and returns the accumulated state.

### State Updates

State updates are **immutable** and **partial**:

```typescript
// ✅ Good: Partial update with spread
return {
  steps: state.steps.slice(1),
  retrieval: {
    ...(state.retrieval ?? {}),
    field: [...(state.retrieval?.field ?? []), newResult],
  },
};

// ❌ Bad: Mutating state
state.retrieval.field.push(newResult);
return state;
```

---

## State Management

### State Schema Design

The state schema should:

1. **Extend MessagesZodState** for conversation history
2. **Group related data** in nested objects (e.g., `retrieval`)
3. **Use arrays** for accumulating results
4. **Track execution** with `steps` and `completed` arrays
5. **Make fields optional** when they may not exist initially

### State Access Patterns

**In Nodes:**

```typescript
const existing = state.retrieval?.field ?? [];
const newData = result.structuredResponse.data;
return {
  retrieval: {
    ...(state.retrieval ?? {}),
    field: [...existing, newData],
  },
};
```

**In Agents (via get_state tool):**

```typescript
const context = { field: state.retrieval?.field ?? [] };
await agent.invoke(messages, { context });
```

### Deduplication

Implement deduplication when accumulating arrays to prevent duplicates.

---

## Agent Design Patterns

### Router Agent Pattern

The router agent plans execution steps:

1. Inspects state via `get_state` tool
2. Determines needed steps based on query and state
3. Generates ordered step list with prompts and reasons
4. Returns empty steps array if information is complete

**Key Characteristics:**

- Uses minimal reasoning effort (can be adjusted based on complexity needs)
- Has access to all state via context
- Returns structured step list
- Each step includes: `prompt`, `reason`, `step` (target node)
- Router node includes early return logic: if steps already exist, returns empty update

### Specialized Agent Pattern

Specialized agents handle domain-specific retrieval:

1. Check existing state via `get_state` tool
2. Extract requirements from step prompt
3. Call retrieval tools
4. Return structured results matching state schema

**Key Characteristics:**

- Use appropriate model size for task complexity
- Focused on single domain
- Return domain-specific structured data
- Accumulate results (don't overwrite)

### Finalize Agent Pattern

The finalize agent synthesizes the final response:

1. Reads all retrieval results via `get_state` tool
2. Synthesizes comprehensive response from accumulated data
3. Returns final message to user

**Key Characteristics:**

- Has access to all retrieval results
- Returns natural language response
- Uses all accumulated context
- **Note:** A finalize agent and node exist in the codebase but are not currently connected to the graph. The graph terminates when the step queue is empty (router returns empty steps array).

---

## Tool Development

### Tool Structure

```typescript
export const toolName = tool(
  async (params: ToolParams) => {
    // 1. Validate inputs
    // 2. Call external API or perform computation
    // 3. Transform/validate response
    // 4. Return structured result
    // 5. Handle errors gracefully
  },
  {
    name: 'tool_name',
    description: 'Clear, concise description',
    schema: z.object({
      // Zod schema matching params
    }),
  },
);
```

### Error Handling

```typescript
try {
  // Operation
} catch (error) {
  console.error(
    '[tool_name] Error:',
    error instanceof Error ? error.message : error,
  );
  throw new Error(
    `User-friendly error message: ${error instanceof Error ? error.message : String(error)}`,
  );
}
```

### Input Validation

- Use Zod schemas for all inputs
- Provide descriptive error messages
- Normalize inputs (trim strings, convert types)
- Validate ranges and constraints

### Output Formatting

- Return structured objects
- Use consistent naming conventions
- Include metadata when helpful
- Match expected state schema types

### Special Tool: get_state

The `get_state` tool allows agents to read graph state:

```typescript
export const getState = tool(
  ({ key }: { key: string }, config) => {
    const { context } = config;
    if (!context) {
      throw new Error('Context is required.');
    }
    const value = context[key];
    if (value === undefined || value === null) {
      return null;
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  },
  {
    name: 'get_state',
    description: 'Retrieves data from the current graph state.',
    schema: z.object({
      key: z.string().describe('The key of the state object to retrieve.'),
    }),
  },
);
```

**Usage in Agents:**

Agents receive context when invoked:

```typescript
await agent.invoke(messages, {
  context: {
    field: state.retrieval?.field ?? [],
    // ... other context
  },
});
```

---

## Best Practices

### Code Organization

1. **One agent per file** in `agents/` directory
2. **One node per file** in `nodes/` directory
3. **One tool per file** in `tools/` directory
4. **Shared schemas** in `models/` directory
5. **Graph assembly** in `graphs/` directory

### Type Safety

1. **Use Zod schemas** for all data structures
2. **Infer types** from schemas: `type GraphState = z.infer<typeof GraphStateSchema>`
3. **Export schemas** for reuse across files
4. **Use TypeScript strict mode**
5. **Avoid `any` types**

### Error Handling

1. **Catch errors** in tools and nodes
2. **Log errors** with context (`[tool_name] Error: ...`)
3. **Throw user-friendly errors**
4. **Handle missing data** gracefully (use nullish coalescing)
5. **Validate inputs** at tool boundaries

### State Updates

1. **Always return partial state** (only changed fields)
2. **Use spread operators** for immutable updates
3. **Accumulate arrays** (don't overwrite)
4. **Handle undefined/null** with nullish coalescing
5. **Preserve existing data** when updating nested objects

### Agent Prompts

1. **Be specific** about agent's role and responsibilities
2. **Include examples** when helpful
3. **Document available tools** and their usage
4. **Specify output format** clearly
5. **Include edge cases** and error handling instructions
6. **Use structured sections** (ROLE, TOOLS, WORKFLOW, etc.)

### Tool Design

1. **Single responsibility** per tool
2. **Clear naming** (snake_case, descriptive)
3. **Comprehensive descriptions**
4. **Validate all inputs**
5. **Return structured data**
6. **Handle API errors** gracefully
7. **Log operations** for debugging

### Performance

1. **Use appropriate model sizes** based on task complexity
2. **Set reasoning effort** based on complexity
3. **Batch operations** when possible
4. **Cache results** in state to avoid redundant calls
5. **Use deduplication** for accumulated arrays

---

## Development Guidelines

### Adding a New Agent

1. Create agent file with model, context schema, response format, and system prompt
2. Create node file that invokes agent and updates state
3. Update state schema if new retrieval fields are needed
4. Update graph to include new node and routing
5. Update router agent to include new agent in planning

### Adding a New Tool

1. Create tool file with Zod schema, implementation, and error handling
2. Add tool to agent's tools array
3. Update agent prompt to document tool usage

---

## Testing Strategy

- **Unit Testing**: Test tools, nodes, edges, and state schemas individually
- **Integration Testing**: Test agent+tool, node+agent, and graph flow interactions
- **End-to-End Testing**: Test complete workflows from user query to final response

## Summary

This architecture provides a **scalable, type-safe, and maintainable** foundation for building LangGraph-based multi-agent systems:

1. **Clear separation** between routing, retrieval, and synthesis
2. **Type safety** throughout with Zod schemas
3. **Modular design** for easy extension
4. **State-driven** execution with immutable updates
5. **Comprehensive tooling** for external integrations
