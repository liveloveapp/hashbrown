import styles from './ConceptDiagram.module.css';

/** Small architecture flows used before the application examples in learning guides. */
export const CONCEPT_DIAGRAMS = {
  'generative-ui': {
    title: 'From a component contract to an interface',
    caption:
      'The model selects from your catalog. Your application supplies the component implementation and its behavior.',
    steps: [
      {
        title: 'Trusted catalog',
        description: 'Expose component names, descriptions and prop schemas.',
      },
      {
        title: 'Model response',
        description:
          'The model supplies a component selection and JSON values.',
      },
      {
        title: 'Schema parsing',
        description: 'Hashbrown resolves supported values as they arrive.',
      },
      {
        title: 'Your component',
        description: 'React or Angular renders the implementation you own.',
      },
    ],
  },
  tools: {
    title: 'One turn can include a tool round trip',
    caption:
      'A tool result becomes context for the next model response. The handler owns access checks and side effects.',
    steps: [
      {
        title: 'User request',
        description:
          'A message starts a run with the available tool contracts.',
      },
      {
        title: 'Tool call',
        description:
          'The model requests a named tool with schema-shaped arguments.',
      },
      {
        title: 'Tool result',
        description:
          'Your handler checks the request and returns application data.',
      },
      {
        title: 'Continuation',
        description: 'The model uses that result to continue the same turn.',
      },
    ],
  },
  'structured-output': {
    title: 'Separate the data contract from application rules',
    caption:
      'A typed preview helps the interface respond early. Applying a result still requires completion and application validation.',
    steps: [
      {
        title: 'Schema',
        description:
          'Describe the fields and supported types the model should return.',
      },
      {
        title: 'JSON output',
        description: 'The provider streams a response under that contract.',
      },
      {
        title: 'Typed preview',
        description: 'Hashbrown parses values for your own renderer.',
      },
      {
        title: 'Application action',
        description:
          'Check completion, freshness and business rules before a write.',
      },
    ],
  },
  streaming: {
    title: 'Stream observations before accepting a result',
    caption:
      'Transport chunks, parsed values and a successfully completed document are different observations.',
    steps: [
      {
        title: 'Incoming chunks',
        description:
          'Network boundaries do not have to match JSON field boundaries.',
      },
      {
        title: 'Incremental parser',
        description: 'The schema determines which partial values can resolve.',
      },
      {
        title: 'Live preview',
        description:
          'Your interface updates as useful values become available.',
      },
      {
        title: 'Completion check',
        description:
          'A completed source and valid document permit further review.',
      },
    ],
  },
  conversation: {
    title: 'A conversation carries context between turns',
    caption:
      'A thread identifies the conversation; a run identifies one execution. Neither identifier persists history by itself.',
    steps: [
      {
        title: 'User message',
        description: 'Add a new request to the current conversation.',
      },
      {
        title: 'Run and context',
        description: 'Send the relevant messages and configured contracts.',
      },
      {
        title: 'Assistant response',
        description: 'Receive text, structured values or trusted UI.',
      },
      {
        title: 'Next turn',
        description: 'Keep appropriate history when the user follows up.',
      },
    ],
  },
  workflow: {
    title: 'Observe a workflow and make approval explicit',
    caption:
      'Progress describes ongoing work. An approval is a separate user decision, and durable recovery needs a server integration.',
    steps: [
      { title: 'Run', description: 'Start the configured agent workflow.' },
      {
        title: 'Progress and draft',
        description:
          'Observe activities and proposed state while work continues.',
      },
      {
        title: 'Pause and review',
        description: 'Present the actual pending decision to the user.',
      },
      {
        title: 'Explicit resume',
        description: 'Continue only with a supported, current response.',
      },
    ],
  },
  persistence: {
    title: 'Saving and restoring are application operations',
    caption:
      'Choose the persistence contract deliberately: completed text history and durable agent checkpoints preserve different things.',
    steps: [
      {
        title: 'Capture supported data',
        description: 'Select completed history or a native durable checkpoint.',
      },
      {
        title: 'Application storage',
        description:
          'Use a versioned format and the access boundary appropriate to its storage.',
      },
      {
        title: 'Read and validate',
        description:
          'Check access, compatibility and the current application revision.',
      },
      {
        title: 'Explicit restoration',
        description:
          'Restore supported state; resuming work is a separate action.',
      },
    ],
  },
  'client-server': {
    title: 'Keep rendering and provider policy at their boundaries',
    caption:
      'The endpoint verifies access and selects trusted server configuration before provider work starts.',
    steps: [
      {
        title: 'Application client',
        description: 'Own messages, rendering and explicit user actions.',
      },
      {
        title: 'Your endpoint',
        description: 'Authenticate, authorize and select server policy.',
      },
      {
        title: 'Provider adapter',
        description:
          'Map the run to the provider API using server credentials.',
      },
      {
        title: 'Event stream',
        description: 'Return AG-UI lifecycle and content events to the client.',
      },
    ],
  },
  decisions: {
    title: 'Choose among options the application already knows',
    caption:
      'The model proposes a known option. Confidence is an observation, so the application still decides whether and how to use it.',
    steps: [
      {
        title: 'Known options',
        description:
          'Define candidate actions or views and their descriptions.',
      },
      {
        title: 'Current context',
        description: 'Supply the input needed to distinguish those options.',
      },
      {
        title: 'Whole decision',
        description:
          'Receive a selected candidate and the available confidence data.',
      },
      {
        title: 'Application handling',
        description:
          'Check the result, ask for clarification or accept a manual choice.',
      },
    ],
  },
  'local-models': {
    title: 'Prepare inference on the user device',
    caption:
      'Model availability and preparation are explicit application states. A hosted fallback needs its own user-facing data decision.',
    steps: [
      {
        title: 'Capability check',
        description:
          'Check whether the actual device can provide the required model capability.',
      },
      {
        title: 'Explicit preparation',
        description:
          'Let the user prepare or download the model and observe progress.',
      },
      {
        title: 'Local inference',
        description:
          'Run the configured request through the browser-side transport.',
      },
      {
        title: 'Application preview',
        description:
          'Render supported values and check completion before further use.',
      },
    ],
  },
  runtime: {
    title: 'Give generated code a narrow execution boundary',
    caption:
      'A JavaScript sandbox limits exposed capabilities. Application-owned host functions still need their own checks.',
    steps: [
      {
        title: 'Script',
        description: 'Choose the code and the input the runtime will evaluate.',
      },
      {
        title: 'Sandbox',
        description:
          'Execute with the configured limits and exposed capabilities.',
      },
      {
        title: 'Host function',
        description:
          'Mediate any permitted access to application data or actions.',
      },
      {
        title: 'Result or error',
        description: 'Inspect the outcome before using it in the application.',
      },
    ],
  },
} as const;

/** Render an accessible, static architecture flow selected by its documentation concept. */
export function ConceptDiagram({ concept }: { concept: string }) {
  if (!Object.hasOwn(CONCEPT_DIAGRAMS, concept)) {
    throw new Error(`Unknown concept diagram: ${concept}`);
  }
  const diagram = CONCEPT_DIAGRAMS[concept as keyof typeof CONCEPT_DIAGRAMS];
  return (
    <figure className={styles.diagram} data-concept={concept}>
      <p className={styles.title}>{diagram.title}</p>
      <ol className={styles.steps} role="list">
        {diagram.steps.map((step, index) => (
          <li key={step.title}>
            <span className={styles.number} aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <figcaption>{diagram.caption}</figcaption>
    </figure>
  );
}
