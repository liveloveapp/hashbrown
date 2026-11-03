import {
  Component,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTool } from '@hashbrownai/react';
import type {
  ConversationRecoveryState,
  PendingConversationRecovery,
  ResumeConversationRecoveryOptions,
} from '@hashbrownai/core';
import {
  type CandidateConfiguration,
  candidateError,
  candidateFrameworkError,
  type CandidatePanelActions,
  candidateWeatherSchema,
  createCandidateBrowserRuntime,
  finishCandidateConfigAction,
  openCandidateThread,
  runCandidateWeather,
} from '../candidate-runtime';
import {
  buildCandidateRecoveryOptions,
  buildCandidateRecoveryRead,
  type CandidateRecoveryEnvelope,
  type CandidateRecoveryForm,
  createCandidateReadGuard,
  parseCandidateRecoveryEnvelope,
} from '../recovery';

/** Stable actual tool and transport identities for one mounted conversation. */
export function useCandidateEnvironment(config: CandidateConfiguration) {
  const [, changed] = useState(0);
  const [runtime] = useState(() =>
    createCandidateBrowserRuntime(config, () => changed((value) => value + 1)),
  );
  const weather = useTool({
    name: 'getWeather',
    description: 'Read the weather for a city',
    schema: candidateWeatherSchema,
    handler: (args, signal) => runCandidateWeather(config, args, signal),
    deps: [config],
  });
  const tools = useMemo(() => [weather], [weather]);
  return { runtime, tools };
}

/** Actual observed data and explicit public callbacks for the presentation panel. */
export interface CandidatePanelProps {
  readonly config: CandidateConfiguration;
  readonly pending: PendingConversationRecovery | undefined;
  readonly recovery: ConversationRecoveryState;
  readonly data: Readonly<Record<string, unknown>>;
  readonly actions: CandidatePanelActions;
  readonly children?: ReactNode;
}

/** Explicit form keyed by the current local batch token; choices never migrate between restores. */
function RecoveryForm({
  pending,
  submit,
}: {
  pending: PendingConversationRecovery;
  submit: (batchId: string, form: CandidateRecoveryForm) => void;
}) {
  const [outcomes, setOutcomes] = useState<CandidateRecoveryForm['outcomes']>(
    [],
  );
  const [decisions, setDecisions] = useState<
    CandidateRecoveryForm['decisions']
  >([]);
  return (
    <section>
      {pending.toolCalls.map((call) => {
        const choice = outcomes.find((item) => item.toolCallId === call.id);
        const update = (value: { status?: string; json?: string }) =>
          setOutcomes((current) => [
            ...current.filter((item) => item.toolCallId !== call.id),
            {
              toolCallId: call.id,
              status: choice?.status ?? '',
              json: choice?.json ?? '',
              ...value,
            },
          ]);
        return (
          <fieldset key={call.id}>
            <legend>
              {call.id}: {call.name}
            </legend>
            <pre>{JSON.stringify(call.arguments)}</pre>
            <select
              aria-label={`Outcome ${call.id}`}
              data-testid={`outcome-status-${call.id}`}
              value={choice?.status ?? ''}
              onChange={(event) => update({ status: event.target.value })}
            >
              <option value="">Choose an observation</option>
              <option value="result">Known JSON result</option>
              <option value="unavailable">Result unavailable</option>
            </select>
            <textarea
              aria-label={`Known result ${call.id}`}
              data-testid={`outcome-value-${call.id}`}
              value={choice?.json ?? ''}
              onChange={(event) => update({ json: event.target.value })}
            />
          </fieldset>
        );
      })}
      {pending.interrupts.map((interrupt) => (
        <label key={interrupt.id}>
          {interrupt.id}: {interrupt.reason}
          <select
            data-testid={`decision-${interrupt.id}`}
            value={
              decisions.find((item) => item.interruptId === interrupt.id)
                ?.decision ?? ''
            }
            onChange={(event) =>
              setDecisions((current) => [
                ...current.filter((item) => item.interruptId !== interrupt.id),
                { interruptId: interrupt.id, decision: event.target.value },
              ])
            }
          >
            <option value="">Choose a decision</option>
            <option value="approve">Approve</option>
            <option value="decline">Decline</option>
            <option value="cancel">Cancel</option>
          </select>
        </label>
      ))}
      <button
        data-testid="submit"
        onClick={() => submit(pending.id, { outcomes, decisions })}
      >
        Submit complete recovery
      </button>
    </section>
  );
}

/** Escaped recovery controls and read-only observations; execution remains in the actual facade. */
export function CandidatePanel(props: CandidatePanelProps) {
  const { config, pending, recovery, data, actions, children } = props;
  const [prompt, setPrompt] = useState(config.prompt);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<Omit<
    CandidateRecoveryEnvelope,
    'snapshot'
  > | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [history, setHistory] = useState<'strict' | 'preserve-diagnostics'>(
    'strict',
  );
  const [, rerender] = useState(0);
  const [guard] = useState(createCandidateReadGuard);
  const latest = useRef(props);
  const previous = useRef<PendingConversationRecovery | undefined>(undefined);
  const lastSubmission = useRef<ResumeConversationRecoveryOptions | undefined>(
    undefined,
  );
  useEffect(() => {
    latest.current = props;
  }, [props]);
  useEffect(() => () => guard.invalidate(), [guard]);
  const invoke = (name: string, action: () => void) => {
    setLastAction(name);
    setLocalError(null);
    try {
      action();
    } catch (error: unknown) {
      setLocalError(candidateError(error));
    }
  };
  const read = async () => {
    const revision = recovery.revision;
    const ticket = guard.begin(config.threadId, revision);
    previous.current = pending ?? previous.current;
    setLastAction('read');
    setLocalError(null);
    try {
      const request = buildCandidateRecoveryRead(
        config,
        actions.configuration(),
      );
      const response = await fetch(request.url, request.init);
      if (!response.ok)
        throw new Error(`Recovery read failed: ${response.status}`);
      const raw: unknown = await response.json();
      if (
        !guard.isCurrent(
          ticket,
          latest.current.config.threadId,
          latest.current.recovery.revision,
        )
      )
        throw new Error('Superseded recovery read');
      const envelope = parseCandidateRecoveryEnvelope(raw, config.threadId, [
        'getWeather',
      ]);
      const { snapshot, ...metadata } = envelope;
      setLastRead(metadata);
      if (snapshot) {
        actions.restore(snapshot, {
          expectedRevision: revision,
          structuredHistory: history,
        });
        if (snapshot.pendingBrowserRecovery) actions.restored?.();
      }
    } catch (error: unknown) {
      setLocalError(candidateError(error));
    }
  };
  const submit = (batchId: string, form: CandidateRecoveryForm) =>
    invoke('resumeConversationRecovery', () => {
      const current = latest.current.pending;
      if (!current || batchId !== current.id)
        throw new Error('Form belongs to an obsolete recovery batch');
      const options = buildCandidateRecoveryOptions(current, form);
      lastSubmission.current = options;
      actions.settle(options);
    });
  const negative = (kind: 'stale' | 'outcomes' | 'decisions') =>
    invoke(`negative-${kind}`, () => {
      const current = kind === 'stale' ? previous.current : pending;
      if (!current) throw new Error('No genuine recovery token available');
      actions.settle({
        batchId: current.id,
        outcomes:
          kind === 'outcomes'
            ? []
            : current.toolCalls.map((call) => ({
                toolCallId: call.id,
                status: 'unavailable' as const,
              })),
        entries:
          kind === 'decisions'
            ? []
            : current.interrupts.map((interrupt) => ({
                interruptId: interrupt.id,
                status: 'cancelled' as const,
              })),
      });
    });
  return (
    <main data-testid="candidate-isolation-ready">
      <label>
        Prompt
        <textarea
          data-testid="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <button
        data-testid="start"
        onClick={() => invoke('start', () => actions.start(prompt))}
      >
        Start
      </button>
      <button
        data-testid="next"
        onClick={() => invoke('next', () => actions.next(config.nextPrompt))}
      >
        Next message
      </button>
      <button data-testid="read" onClick={() => void read()}>
        Read retained conversation
      </button>
      <button data-testid="fresh-read" onClick={() => void read()}>
        Fresh authoritative read
      </button>
      <button data-testid="stop" onClick={() => invoke('stop', actions.stop)}>
        Stop
      </button>
      <button
        data-testid="new-thread"
        onClick={() => {
          guard.invalidate();
          openCandidateThread(config);
        }}
      >
        New thread
      </button>
      <button
        data-testid="rerender"
        onClick={() => rerender((value) => value + 1)}
      >
        Rerender
      </button>
      <label>
        Structured history
        <select
          data-testid="structured-history"
          value={history}
          onChange={(event) =>
            setHistory(
              event.target.value === 'preserve-diagnostics'
                ? 'preserve-diagnostics'
                : 'strict',
            )
          }
        >
          <option value="strict">Strict</option>
          <option value="preserve-diagnostics">Preserve diagnostics</option>
        </select>
      </label>
      <pre data-testid="pending">{JSON.stringify(pending ?? null)}</pre>
      {pending && (
        <RecoveryForm key={pending.id} pending={pending} submit={submit} />
      )}
      {lastSubmission.current && (
        <button
          data-testid="negative-repeat-submit"
          onClick={() =>
            invoke('negative-repeat-submit:resumeConversationRecovery', () => {
              const options = lastSubmission.current;
              if (!options)
                throw new Error('No actual previous submission available');
              actions.settle(options);
            })
          }
        >
          Repeat the exact submitted options
        </button>
      )}
      <button
        data-testid="negative-stale-token"
        onClick={() => negative('stale')}
      >
        Try former token
      </button>
      <button
        data-testid="negative-incomplete-outcomes"
        onClick={() => negative('outcomes')}
      >
        Try incomplete outcomes
      </button>
      {!!pending?.interrupts.length && (
        <button
          data-testid="negative-incomplete-decisions"
          onClick={() => negative('decisions')}
        >
          Try incomplete decisions
        </button>
      )}
      {Object.entries(actions.negatives).map(([name, action]) => (
        <button
          key={name}
          data-testid={name}
          onClick={() => invoke(name, action)}
        >
          {name}
        </button>
      ))}
      <pre data-testid="status">
        {JSON.stringify({
          facade: config.facade,
          threadId: config.threadId,
          recovery,
          pending: pending ?? null,
          ...data,
          localError,
          lastRead,
          lastAction,
        })}
      </pre>
      {children}
    </main>
  );
}

/** Records actual React render/effect errors without treating unexpected errors as config evidence. */
export class CandidateErrorBoundary extends Component<
  { children: ReactNode },
  { failure: ReturnType<typeof candidateFrameworkError> | null }
> {
  state: { failure: ReturnType<typeof candidateFrameworkError> | null } = {
    failure: null,
  };
  /** React supplies the actual exception thrown by the mounted public facade effect. */
  static getDerivedStateFromError(error: unknown) {
    return { failure: candidateFrameworkError(error) };
  }
  /** Ends only the action epoch that produced this actual failure. */
  componentDidCatch(): void {
    finishCandidateConfigAction(this.state.failure?.epoch ?? undefined);
  }
  /** Shows escaped exception data after React retires the failed subtree. */
  render() {
    const failure = this.state.failure;
    return failure ? (
      <main data-testid="candidate-isolation-ready">
        <pre data-testid={failure.classification}>
          {JSON.stringify(failure)}
        </pre>
      </main>
    ) : (
      this.props.children
    );
  }
}
