/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Represents a minimal Redux-like store.
 * @template State - The shape of the store's state.
 * @property dispatch - Dispatches an action to update state.
 * @property select - Selects a slice of state using a selector function.
 * @property when - Registers a callback for one or more action types.
 * @property whenOnce - Registers a one-time callback for action types.
 * @property teardown - Cleans up any registered effects.
 */
export interface Store<State> {
  dispatch: (action: AnyAction) => void;
  read: <T>(selector: (state: State) => T) => T;
  select: <T>(
    selector: (state: State) => T,
    onChange: (value: T) => void,
  ) => () => void;
  when: <
    Actions extends readonly ActionCreator[],
    Handler extends (action: ActionType<Actions[number]>) => void,
  >(
    ...params: [...Actions, Handler]
  ) => () => void;
  whenOnce: <
    Actions extends readonly ActionCreator[],
    Handler extends (action: ActionType<Actions[number]>) => void,
  >(
    ...params: [...Actions, Handler]
  ) => () => void;
  teardown: () => void;
}

/**
 * ================================
 * ===         Actions          ===
 * ================================
 */

/**
 * A generic action object.
 *
 * @typedef AnyAction
 * @property {string} type - The action type identifier.
 * @property {*} [payload] - Optional payload for the action.
 */
type AnyAction = { type: string; payload: any } | { type: string };

/**
 * Defines a function type that produces payload objects for action creators.
 *
 * @typedef PropsFunction
 * @param {*} payload - The payload for the action.
 * @returns {*} The processed payload or void.
 */
type PropsFunction = (payload: any) => any | (() => void);

/**
 * Extracts the payload type from a PropsFunction.
 *
 * @template T - A function type that defines action payload.
 * @typedef Payload
 */
type Payload<T extends PropsFunction> = T extends () => void
  ? void
  : T extends (payload: infer P) => infer P
    ? P
    : never;

/**
 * Factory type for creating strongly-typed action creator functions.
 *
 * @template K - The action type string.
 * @template T - A PropsFunction defining the payload shape.
 * @typedef ActionCreator
 */
type ActionCreator<
  K extends string = string,
  T extends PropsFunction = PropsFunction,
> = {
  type: K;
} & (Payload<T> extends void
  ? () => { type: K }
  : (payload: Payload<T>) => { type: K; payload: Payload<T> });

/**
 * Infers the action object type produced by an ActionCreator.
 *
 * @template T - The ActionCreator type.
 * @typedef ActionType
 */
type ActionType<T> =
  T extends ActionCreator<infer K, infer R>
    ? R extends (payload: infer P) => infer P
      ? P extends void
        ? { type: K }
        : { type: K; payload: P }
      : never
    : never;

/**
 * A mapping of action name keys to their corresponding ActionCreator functions.
 *
 * @template GroupName - The prefix group name for action types.
 * @template T - An object of payload function definitions.
 * @typedef ActionCreators
 */
type ActionCreators<
  GroupName extends string,
  T extends { [key: string]: PropsFunction },
> = {
  [K in keyof T]: K extends string
    ? ActionCreator<`[${GroupName}] ${K}`, T[K]>
    : never;
};

/**
 * Creates a payload projector function that returns its argument.
 *
 * @template T - The payload type.
 * @returns {(payload: T) => T} Function that returns the provided payload.
 */
export function props<T>(): (payload: T) => T {
  return (payload: T) => payload;
}

/**
 * Creates an action creator with no payload.
 *
 * @returns {() => void} Function that produces an action with only a type.
 */
export function emptyProps(): () => void {
  return () => {};
}

/**
 * Generates a group of action creator functions with a common type prefix.
 *
 * @template GroupName - The modifier for action types (e.g., feature name).
 * @template T - An object whose values are payload creator functions.
 * @param {GroupName} name - The group prefix name.
 * @param {T} group - An object mapping action names to payload functions.
 * @returns {ActionCreators<GroupName, T>} A set of action creators.
 */
export function createActionGroup<
  GroupName extends string,
  T extends { [key: string]: (...args: any[]) => any },
>(name: GroupName, group: T): ActionCreators<GroupName, T> {
  return Object.fromEntries(
    Object.entries(group).map(([key, value]) => [
      key,
      Object.assign(
        typeof value === 'function'
          ? (payload: Payload<typeof value>) => ({
              type: `[${name}] ${key}`,
              payload,
            })
          : () => ({ type: `[${name}] ${key}` }),
        { type: `[${name}] ${key}` },
      ),
    ]),
  ) as ActionCreators<GroupName, T>;
}

/**
 * ================================
 * ===         Reducers         ===
 * ================================
 */

/**
 * Creates a reducer function that responds to specified action types.
 *
 * @template State - The type of the slice of state.
 * @template Actions - An array of ActionCreator types to handle.
 * @param {...Actions, Handler} params - One or more action creators followed by a reducer handler.
 * @returns {(state: State, action: AnyAction) => State} A reducer function.
 */
export function on<
  State,
  Actions extends readonly ActionCreator[],
  Handler extends (state: State, action: ActionType<Actions[number]>) => State,
>(
  ...params: [...Actions, Handler]
): (state: State, action: AnyAction) => State {
  const actionFns = params.slice(0, -1) as ActionCreator[];
  const reducerFn = params[params.length - 1] as (
    state: State,
    action: ActionType<Actions[number]>,
  ) => State;

  return (state: State, action: AnyAction) => {
    const shouldReduceState = actionFns.some(
      (param) => param.type === action.type,
    );
    if (!shouldReduceState) {
      return state;
    }
    return reducerFn(state, action as unknown as ActionType<Actions[number]>);
  };
}

/**
 * Combines multiple reducer functions into a single root reducer.
 *
 * @template State - The combined state shape.
 * @param {State} initialState - The initial state when undefined is passed.
 * @param {...Function} reducers - One or more reducer functions.
 * @returns {(state: State|undefined, action: { type: string }) => State} The root reducer.
 */
export function createReducer<State>(
  initialState: State,
  ...reducers: readonly ((state: State, action: { type: string }) => State)[]
) {
  return (state: State | undefined, action: { type: string }) => {
    return reducers.reduce(
      (acc, reducer) => reducer(acc, action),
      state === undefined ? initialState : state,
    );
  };
}

/**
 * ================================
 * ===         Effects          ===
 * ================================
 */

/**
 * Defines an effect that can subscribe to store actions and return a cleanup function.
 *
 * @param {EffectFn} effectFn - Function that receives the store and returns a teardown callback.
 * @returns {EffectFn} The provided effect function.
 */
type EffectFn = (store: Store<any>) => () => void;

/**
 * Creates an effect function that can subscribe to store actions and return a cleanup function.
 *
 * @param {EffectFn} effectFn - Function that receives the store and returns a teardown callback.
 * @returns {EffectFn} The provided effect function.
 */
export function createEffect(effectFn: EffectFn) {
  return effectFn;
}

/**
 * ================================
 * ===         Selectors          ===
 * ================================
 */

/**
 * Creates a memoized selector from one or more input selectors and a projector function.
 * @param {...Function, Function} params - Input selector functions followed by a projector.
 * @returns {(state: any) => any} A selector function that returns computed state.
 */
export function select<S, T0, R>(
  t0: (state: S) => T0,
  projectFn: (t0: T0) => R,
): (state: S) => R;
export function select<S, T0, T1, R>(
  t0: (state: S) => T0,
  t1: (state: S) => T1,
  projectFn: (t0: T0, t1: T1) => R,
): (state: S) => R;
export function select<S, T0, T1, T2, R>(
  t0: (state: S) => T0,
  t1: (state: S) => T1,
  t2: (state: S) => T2,
  projectFn: (t0: T0, t1: T1, t2: T2) => R,
): (state: S) => R;
export function select<S, T0, T1, T2, T3, R>(
  t0: (state: S) => T0,
  t1: (state: S) => T1,
  t2: (state: S) => T2,
  t3: (state: S) => T3,
  projectFn: (t0: T0, t1: T1, t2: T2, t3: T3) => R,
): (state: S) => R;
export function select<S, T0, T1, T2, T3, T4, R>(
  t0: (state: S) => T0,
  t1: (state: S) => T1,
  t2: (state: S) => T2,
  t3: (state: S) => T3,
  t4: (state: S) => T4,
  projectFn: (t0: T0, t1: T1, t2: T2, t3: T3, t4: T4) => R,
): (state: S) => R;
export function select<S, T0, T1, T2, T3, T4, T5, R>(
  t0: (state: S) => T0,
  t1: (state: S) => T1,
  t2: (state: S) => T2,
  t3: (state: S) => T3,
  t4: (state: S) => T4,
  t5: (state: S) => T5,
  projectFn: (t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5) => R,
): (state: S) => R;
export function select<S, T0, T1, T2, T3, T4, T5, T6, R>(
  t0: (state: S) => T0,
  t1: (state: S) => T1,
  t2: (state: S) => T2,
  t3: (state: S) => T3,
  t4: (state: S) => T4,
  t5: (state: S) => T5,
  t6: (state: S) => T6,
): (state: S) => R;
export function select(...params: any[]): (state: any) => any {
  const inputs = params.slice(0, -1) as unknown as ((state: any) => any)[];
  const selectFn = params[params.length - 1] as (...args: any[]) => any;

  let lastInputValues: any[] = [];
  let lastOutput: any;

  return (state: any) => {
    const inputValues = inputs.map((input) => input(state)) as any[];
    if (inputValues.some((value, index) => value !== lastInputValues[index])) {
      lastInputValues = inputValues;
      lastOutput = selectFn(...inputValues);
    }
    return lastOutput;
  };
}

/**
 * ================================
 * ===         Store            ===
 * ================================
 */

/**
 * Creates a store with reducers and effects.
 * @template Reducers - An object mapping keys to reducer functions.
 * @template State - The resulting state shape inferred from Reducers.
 * @param {{ reducers: Reducers; effects: EffectFn[] }} config - Configuration object.
 * @returns {Store<State>} The initialized store instance.
 */
export function createStore<
  Reducers extends {
    [key: string]: (state: any | undefined, action: AnyAction) => unknown;
  },
  State extends {
    [K in keyof Reducers]: Reducers[K] extends (
      state: infer R | undefined,
      action: any,
    ) => infer R
      ? R
      : never;
  },
>(config: {
  debugName?: string;
  reducers: Reducers;
  effects: EffectFn[];
  projectStateForDevtools?: (state: State) => object;
}): Store<State> {
  const devtools = config.debugName
    ? connectToChromeExtension({ name: config.debugName })
    : undefined;
  const reducerFnEntries = Object.entries(config.reducers);
  const reducerFn = function (
    state: State | undefined,
    action: AnyAction,
  ): State {
    return reducerFnEntries.reduce((acc, [key, value]) => {
      return { ...acc, [key]: value(acc?.[key], action) } as State;
    }, state) as State;
  };
  const whenCallbackFnMap = new Map<
    string,
    Array<(action: AnyAction) => void>
  >();
  const selectCallbackFns: Array<() => void> = [];
  const effectCleanupFns: (() => void)[] = [];
  let state = reducerFn(undefined, { type: '@@init' });

  devtools?.init(config.projectStateForDevtools?.(state) ?? state);

  function dispatch(action: AnyAction) {
    state = reducerFn(state, action);

    const whenCallbackFns = whenCallbackFnMap.get(action.type) ?? [];
    whenCallbackFns.forEach((callback) => callback(action));
    selectCallbackFns.forEach((callback) => callback());

    devtools?.send(action, config.projectStateForDevtools?.(state) ?? state);
  }

  function when<
    Actions extends ActionCreator<any, any>[],
    Params extends [...Actions, (action: AnyAction) => void],
  >(...params: Params): () => void {
    const actionFns = params.slice(0, -1) as ActionCreator<any, any>[];
    const callbackFn = params[params.length - 1] as (action: AnyAction) => void;

    actionFns.forEach((actionFn) => {
      if (!whenCallbackFnMap.has(actionFn.type)) {
        whenCallbackFnMap.set(actionFn.type, []);
      }
      whenCallbackFnMap.get(actionFn.type)?.push(callbackFn);
    });

    return () => {
      actionFns.forEach((actionFn) => {
        const callbacks = whenCallbackFnMap.get(actionFn.type) ?? [];

        whenCallbackFnMap.set(
          actionFn.type,
          callbacks.filter((cb) => cb !== callbackFn),
        );
      });
    };
  }

  function whenOnce<
    Actions extends ActionCreator<any, any>[],
    Params extends [...Actions, (action: AnyAction) => void],
  >(...params: Params): () => void {
    const actionFns = params.slice(0, -1) as ActionCreator<any, any>[];
    const callbackFn = params[params.length - 1] as (action: AnyAction) => void;

    const cleanupFn = when(...actionFns, (action: AnyAction) => {
      callbackFn(action);
      cleanupFn();
    });

    return cleanupFn;
  }

  function teardown() {
    effectCleanupFns.forEach((fn) => fn());
    devtools?.unsubscribe();
  }

  function read<T>(selector: (state: State) => T): T {
    return selector(state);
  }

  function select<T>(
    selector: (state: State) => T,
    onChange: (value: T) => void,
  ) {
    let currentValue = read(selector);

    onChange(currentValue);

    const callback = () => {
      const newValue = read(selector);
      if (newValue !== currentValue) {
        currentValue = newValue;
        onChange(newValue);
      }
    };

    selectCallbackFns.push(callback);

    return () => {
      selectCallbackFns.splice(selectCallbackFns.indexOf(callback), 1);
    };
  }

  const store: Store<State> = {
    dispatch,
    read,
    select,
    when: when as Store<State>['when'],
    whenOnce: whenOnce as Store<State>['whenOnce'],
    teardown,
  };

  config.effects.forEach((effect) => {
    effect(store);
  });

  return store;
}

/**
 * ================================
 * ===         Entities         ===
 * ================================
 */

/**
 * Maintains a normalized collection of entities.
 * @template Entity - The type of the entity.
 * @property {string[]} ids - Array of entity IDs.
 * @property {Record<string, Entity>} entities - Map of IDs to entity objects.
 */
export interface EntityState<Entity> {
  ids: string[];
  entities: Record<string, Entity>;
}

/**
 * Describes a partial update to a single entity.
 * @template Entity - The entity type.
 * @property {string} id - The target entity ID.
 * @property {Partial<Entity>} updates - The fields to update.
 */
export interface EntityChange<Entity> {
  id: string;
  updates: Partial<Entity>;
}

/**
 * Provides methods to manage a collection of entities.
 * @template Entity - The entity type.
 * @property updateOne - Updates a single entity.
 * @property updateMany - Updates multiple entities.
 * @property addOne - Adds a single new entity.
 * @property addMany - Adds multiple new entities.
 * @property removeOne - Removes a single entity by ID.
 * @property removeMany - Removes multiple entities by ID.
 */
export interface EntityAdapter<Entity> {
  updateOne: (
    state: EntityState<Entity>,
    changes: EntityChange<Entity>,
  ) => EntityState<Entity>;
  updateMany: (
    state: EntityState<Entity>,
    changes: EntityChange<Entity>[],
  ) => EntityState<Entity>;
  addOne: (state: EntityState<Entity>, entity: Entity) => EntityState<Entity>;
  addMany: (
    state: EntityState<Entity>,
    entities: Entity[],
  ) => EntityState<Entity>;
  removeOne: (state: EntityState<Entity>, id: string) => EntityState<Entity>;
  removeMany: (
    state: EntityState<Entity>,
    ids: string[],
  ) => EntityState<Entity>;
}

/**
 * Creates an EntityAdapter for performing immutable updates on entity collections.
 * @template Entity - The entity type.
 * @param {{ selectId: (entity: Entity) => string }} config - Configuration with a selectId function.
 * @returns {EntityAdapter<Entity>} Adapter with CRUD methods for entity state.
 */
export function createEntityAdapter<Entity>(config: {
  selectId: (entity: Entity) => string;
}): EntityAdapter<Entity> {
  const { selectId } = config;

  function updateOne(
    state: EntityState<Entity>,
    changes: { id: string; updates: Partial<Entity> },
  ) {
    return {
      ...state,
      entities: {
        ...state.entities,
        [changes.id]: { ...state.entities[changes.id], ...changes.updates },
      },
    };
  }

  function updateMany(
    state: EntityState<Entity>,
    changes: { id: string; updates: Partial<Entity> }[],
  ) {
    return changes.reduce((acc, change) => updateOne(acc, change), state);
  }

  function addOne(state: EntityState<Entity>, entity: Entity) {
    return {
      ...state,
      ids: [...state.ids, selectId(entity)],
      entities: { ...state.entities, [selectId(entity)]: entity },
    };
  }

  function addMany(state: EntityState<Entity>, entities: Entity[]) {
    return entities.reduce((acc, entity) => addOne(acc, entity), state);
  }

  function removeOne(
    state: EntityState<Entity>,
    id: string,
  ): EntityState<Entity> {
    const updatedEntities = { ...state.entities };

    delete updatedEntities[id];

    return {
      ...state,
      ids: state.ids.filter((id) => id !== id),
      entities: updatedEntities,
    };
  }

  function removeMany(state: EntityState<Entity>, ids: string[]) {
    return {
      ...state,
      ids: state.ids.filter((id) => !ids.includes(id)),
      entities: Object.fromEntries(
        Object.entries(state.entities).filter(([id]) => !ids.includes(id)),
      ),
    };
  }

  return { updateOne, updateMany, addOne, addMany, removeOne, removeMany };
}

/**
 * ================================
 * ===         Devtools         ===
 * ================================
 */

export interface DevtoolsChromeExtension {
  connect: (options: { name: string }) => DevtoolsChromeExtensionConnection;
}

export interface DevtoolsChromeExtensionConnection {
  unsubscribe: () => void;
  send: (action: AnyAction, state: object) => void;
  init: (state: object) => void;
  error: (message: string) => void;
}

export function connectToChromeExtension(options: {
  name: string;
}): DevtoolsChromeExtensionConnection | undefined {
  const extension = (window as any).__REDUX_DEVTOOLS_EXTENSION__ as
    | DevtoolsChromeExtension
    | undefined;

  if (!extension) {
    return;
  }

  return extension.connect({
    name: options.name,
  });
}
