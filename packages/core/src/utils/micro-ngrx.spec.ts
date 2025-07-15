import {
  createActionGroup,
  createEffect,
  createEntityAdapter,
  createReducer,
  createStore,
  emptyProps,
  EntityState,
  on,
  props,
  select,
  TrampolineScheduler,
} from './micro-ngrx';

describe('TrampolineScheduler', () => {
  it('executes tasks synchronously in FIFO order when running', () => {
    const scheduler = new TrampolineScheduler();
    const calls: number[] = [];
    scheduler.scheduleTask(() => calls.push(1));
    scheduler.scheduleTask(() => calls.push(2));

    expect(calls).toEqual([1, 2]);
  });

  it('runs tasks scheduled from within a task after the current task finishes (trampolining)', () => {
    const scheduler = new TrampolineScheduler();
    const calls: number[] = [];

    scheduler.scheduleTask(() => {
      calls.push(1);
      scheduler.scheduleTask(() => calls.push(3));
      calls.push(2);
    });

    expect(calls).toEqual([1, 2, 3]);
  });

  it('surfaces errors asynchronously so later tasks still run', () => {
    jest.useFakeTimers();
    const scheduler = new TrampolineScheduler();
    const calls: number[] = [];

    scheduler.scheduleTask(() => {
      throw new Error('boom');
    });
    scheduler.scheduleTask(() => calls.push(1));

    expect(() => jest.runOnlyPendingTimers()).toThrow('boom');
    jest.useRealTimers();
  });
});

/* ──────────────────────────────────────────────── */

describe('Action creators & reducers', () => {
  const counter = createActionGroup('Counter', {
    increment: props<number>(),
    decrement: props<number>(),
    reset: emptyProps(),
  });

  const counterReducer = createReducer(
    0,
    on(counter.increment, (state, action): number => state + action.payload),
    on(counter.decrement, (state, action): number => state - action.payload),
    on(counter.reset, () => 0),
  );

  it('on() handlers react only to listed action types', () => {
    expect(counterReducer(0, counter.increment(5))).toBe(5);
    expect(counterReducer(5, { type: '[Other] noop' })).toBe(5);
  });
});

/* ──────────────────────────────────────────────── */
// Effects & teardown ----------------------------------------------------------------

describe('Effects and store teardown', () => {
  const todos = createActionGroup('Todos', {
    add: props<{ id: string; text: string }>(),
  });

  const todosReducer = createReducer(
    { ids: [] as string[], entities: {} as Record<string, unknown> },
    on(todos.add, (state, action) => ({
      ids: [...state.ids, action.payload.id],
      entities: { ...state.entities, [action.payload.id]: action.payload },
    })),
  );

  it('invokes effects on run and their cleanup on stop', () => {
    const effectRun = jest.fn();
    const effectCleanup = jest.fn();

    const effect = createEffect(() => {
      effectRun();
      return () => {
        effectCleanup();
      };
    });

    const store = createStore({
      reducers: { todos: todosReducer },
      effects: [effect],
    });

    // effect should not have run yet
    expect(effectRun).not.toHaveBeenCalled();

    const stop = store.runEffects();
    expect(effectRun).toHaveBeenCalledTimes(1);
    expect(effectCleanup).not.toHaveBeenCalled();

    stop();
    expect(effectCleanup).toHaveBeenCalledTimes(1);
  });
});

/* ──────────────────────────────────────────────── */

describe('Store integration', () => {
  const todos = createActionGroup('Todos', {
    add: props<{ id: string; text: string }>(),
    remove: props<string>(),
    clear: emptyProps(),
  });

  type TodoState = EntityState<{ id: string; text: string }>;

  function createTestFixture() {
    const adapter = createEntityAdapter<{ id: string; text: string }>({
      selectId: (t) => t.id,
    });

    const initialTodoState: TodoState = { ids: [], entities: {} };

    const todosReducer = createReducer(
      initialTodoState,
      on(
        todos.add,
        (state, action): TodoState => adapter.addOne(state, action.payload),
      ),
      on(
        todos.remove,
        (state, action): TodoState => adapter.removeOne(state, action.payload),
      ),
      on(todos.clear, () => initialTodoState),
    );

    const store = createStore({
      reducers: { todos: todosReducer, count: (_ = 0) => _ },
      effects: [],
    });

    const cleanup = store.runEffects();

    return { store, cleanup };
  }

  it('dispatch updates state via reducers', () => {
    const { store, cleanup } = createTestFixture();

    store.dispatch(todos.add({ id: '1', text: 'Write tests' }));
    store.dispatch(todos.add({ id: '2', text: '????' }));
    store.dispatch(todos.remove('1'));

    expect(store.read((s) => s.todos.ids)).toEqual(['2']);

    cleanup();
  });

  it('select notifies only on value change and can unsubscribe', () => {
    const { store, cleanup } = createTestFixture();

    const values: number[] = [];
    const selectIds = select(
      (s: { todos: TodoState }) => s.todos,
      (todos) => todos.ids,
    );
    const selectLength = select(selectIds, (ids) => ids.length);
    const unsubscribe = store.select(selectLength, (len) => values.push(len));

    store.dispatch(todos.add({ id: 'a', text: 'Hello' })); // length 1
    store.dispatch(todos.add({ id: 'b', text: 'World' })); // length 2
    store.dispatch({ type: '[Other] noop' }); // unrelated

    unsubscribe();
    store.dispatch(todos.clear()); // would change length but no longer subscribed

    expect(values).toEqual([0, 1, 2]);

    cleanup();
  });

  it('when/whenOnce callbacks fire for matching actions', () => {
    const { store, cleanup } = createTestFixture();

    const hits: string[] = [];

    const off = store.when(todos.add, (a) => hits.push('add:' + a.payload.id));
    store.whenOnce(todos.clear, () => hits.push('clear'));

    store.dispatch(todos.add({ id: 'x', text: 'X' }));
    store.dispatch(todos.add({ id: 'y', text: 'Y' }));
    store.dispatch(todos.clear());
    store.dispatch(todos.clear()); // should not fire again

    off();
    store.dispatch(todos.add({ id: 'z', text: 'Z' })); // listener removed

    expect(hits).toEqual(['add:x', 'add:y', 'clear']);

    cleanup();
  });

  it('createSignal returns value getter & subscribable signal', () => {
    const { store, cleanup } = createTestFixture();

    const todoCount = store.createSignal((s) => s.todos.ids.length);
    const observed: number[] = [];
    const unsub = todoCount.subscribe((v) => observed.push(v));

    expect(todoCount()).toBe(0);
    store.dispatch(todos.add({ id: '1', text: 'a' }));
    store.dispatch(todos.add({ id: '2', text: 'b' }));
    store.dispatch(todos.remove('1'));

    unsub();
    store.dispatch(todos.clear());

    expect(observed).toEqual([0, 1, 2, 1]);

    cleanup();
  });
});

/* ──────────────────────────────────────────────── */

describe('EntityAdapter', () => {
  interface Task {
    id: string;
    done: boolean;
  }
  const adapter = createEntityAdapter<Task>({ selectId: (t) => t.id });

  const empty: EntityState<Task> = { ids: [], entities: {} };
  const a: Task = { id: 'a', done: false };
  const b: Task = { id: 'b', done: false };

  it('addOne & removeOne mutate in an immutable fashion', () => {
    const afterAdd = adapter.addOne(empty, a);
    expect(afterAdd).not.toBe(empty);
    expect(afterAdd.ids).toEqual(['a']);

    const afterRemove = adapter.removeOne(afterAdd, 'a');
    expect(afterRemove.ids).toEqual([]);
  });

  it('updateOne merges updates', () => {
    const start = adapter.addMany(empty, [a, b]);
    const updated = adapter.updateOne(start, {
      id: 'b',
      updates: { done: true },
    });
    expect(updated.entities['b']).toEqual({ id: 'b', done: true });
    expect(updated.entities['a']).toBe(start.entities['a']); // untouched entity identical reference
  });

  it('updateMany & removeMany work with multiple entities', () => {
    const start = adapter.addMany(empty, [a, b]);
    const updated = adapter.updateMany(start, [
      { id: 'a', updates: { done: true } },
      { id: 'b', updates: { done: true } },
    ]);
    expect(Object.values(updated.entities).every((t) => t.done)).toBe(true);

    const cleared = adapter.removeMany(updated, ['a', 'b']);
    expect(cleared.ids).toEqual([]);
    expect(cleared.entities).toEqual({});
  });
});

/* ──────────────────────────────────────────────── */

describe('select() memoization', () => {
  interface Root {
    value: number;
    nested: { doubled: number };
  }
  const selector = select(
    (s: Root) => s.value,
    (value) => ({ doubled: value * 2 }),
  );

  it('returns same output reference when inputs unchanged', () => {
    const state1: Root = { value: 2, nested: { doubled: 4 } };
    const first = selector(state1);
    const second = selector(state1);
    expect(first).toBe(second);
  });

  it('recomputes and returns new reference when inputs change', () => {
    const state1: Root = { value: 2, nested: { doubled: 4 } };
    const state2: Root = { value: 3, nested: { doubled: 6 } };

    const first = selector(state1);
    const second = selector(state2);
    expect(first).not.toBe(second);
    expect(second.doubled).toBe(6);
  });
});
