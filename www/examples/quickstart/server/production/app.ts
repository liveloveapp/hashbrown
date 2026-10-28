import { AsyncLocalStorage } from 'node:async_hooks';
import { resolve } from 'node:path';
import { createRuntimeFetchHandler } from '@b4run/cli/fetch';
import {
  defineAuth,
  hashApprovalGrant,
  type InterruptGrantStore,
  ownedThreads,
  timingSafeHexEqual,
} from '@b4run/sdk';
import {
  createPostgresClientToolCallStore,
  createPostgresInterruptGrantStore,
  createPostgresPermissionsStore,
  createPostgresPool,
  createPostgresRunAdmission,
  createPostgresThreadsStore,
  postgresCheckpointer,
  type SqlPool,
} from '@b4run/postgres-storage/node';
import { issueIdentity, readIdentity, validateRun } from './boundary';
import { projectInterrupts, projectMessages } from './recovery';
import { createProductionRoute } from './route';
import { createApplicationStore } from './storage';

/** Explicit server-only settings; every replica must share database, identity secret and origin. */
export interface ProductionServerOptions {
  readonly databaseUrl: string;
  readonly secret: string;
  readonly origin: string;
  readonly model?: string;
  readonly tablePrefix?: string;
}

/** Creates the fixed authenticated application edge and its private statically authored runtime. */
export async function createProductionServer(options: ProductionServerOptions) {
  if (!options.databaseUrl || options.secret.length < 32)
    throw new Error(
      'Postgres and a shared secret of at least 32 characters are required',
    );
  const origin = new URL(options.origin).origin;
  const pool = createPostgresPool({ connectionString: options.databaseUrl });
  try {
    const naming = {
      schema: 'hashbrown_production',
      tablePrefix: options.tablePrefix ?? 'reference',
    };
    const buildStores = (requestPool: SqlPool, migrated: boolean) => ({
      checkpointer: postgresCheckpointer({
        ...naming,
        pool: requestPool,
        assumeMigrated: migrated,
      }),
      threadsStore: createPostgresThreadsStore({
        ...naming,
        pool: requestPool,
        assumeMigrated: migrated,
      }),
      permissionsStore: createPostgresPermissionsStore({
        ...naming,
        pool: requestPool,
        assumeMigrated: migrated,
      }),
      clientToolStore: createPostgresClientToolCallStore({
        ...naming,
        pool: requestPool,
        assumeMigrated: migrated,
      }),
      grants: createPostgresInterruptGrantStore({
        ...naming,
        pool: requestPool,
        assumeMigrated: migrated,
      }),
    });
    const boot = buildStores(pool, false);
    const applications = createApplicationStore(pool);
    await applications.ready();
    await Promise.all(Object.values(boot).map((store) => store.ready()));
    const bootstrapAdmission = createPostgresRunAdmission({ ...naming, pool });
    await bootstrapAdmission.ready();
    await bootstrapAdmission.close();
    const context = new AsyncLocalStorage<
      ReturnType<typeof buildStores> & {
        application: ReturnType<typeof createApplicationStore>;
        runAdmission: ReturnType<typeof createPostgresRunAdmission>;
      }
    >();
    const current = () => {
      const value = context.getStore();
      if (!value) throw new Error('Missing fenced request context');
      return value;
    };
    // The static runtime binds a boot grant interface. Dispatch it into the same request fence as all other runtime stores.
    const grants: InterruptGrantStore = {
      issue: (record) => current().grants.issue(record),
      get: (thread, id) => current().grants.get(thread, id),
      listForThread: (thread) => current().grants.listForThread(thread),
      consume: (args) => current().grants.consume(args),
      voidOutstanding: (args) => current().grants.voidOutstanding(args),
      prune: (before) => current().grants.prune(before),
    };
    const route = createProductionRoute(async (_input, ctx) => {
      if (!ctx.principal?.id || !ctx.threadId)
        throw new Error('Verified principal and thread required');
      const application = await current().application.accept(
        ctx.threadId,
        ctx.principal.id,
      );
      return {
        result: 'Accepted the two-step recording plan.',
        state: application,
      };
    }, options.model);
    const auth = defineAuth({
      authenticate: (req) => readIdentity(req.headers.cookie, options.secret),
    });
    const threadAccess = ownedThreads();
    const runtime = await createRuntimeFetchHandler({
      appRoot: resolve('www/examples/quickstart/server/production'),
      config: { approvals: { grants: 'required', grantStore: grants } },
      modules: { routes: [route], auth, threadAccess },
      auth,
      threadAccess,
      threadAccessExpected: true,
      authExpected: true,
      permissionsMode: 'boot',
      requestStores: () => {
        const stores = current();
        return { ...stores, dispose: () => stores.runAdmission.close() };
      },
    });
    const internal = (request: Request, path: string, body?: unknown) => {
      const runAdmission = createPostgresRunAdmission({
        ...naming,
        pool,
        assumeMigrated: true,
      });
      const stores = {
        ...buildStores(runAdmission.pool, true),
        runAdmission,
        application: createApplicationStore(runAdmission.pool),
      };
      return context.run(stores, () =>
        runtime.fetch(
          new Request(`${origin}${path}`, {
            method: request.method,
            signal: request.signal,
            headers: {
              cookie: request.headers.get('cookie') ?? '',
              accept: request.headers.get('accept') ?? 'text/event-stream',
              'content-type': 'application/json',
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          }),
        ),
      );
    };
    return {
      close: async () => {
        await runtime.close();
        await pool.end();
      },
      fetch: async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        if (
          request.method !== 'GET' &&
          request.headers.get('origin') !== origin
        )
          return Response.json(
            { error: 'Same-origin mutation required' },
            { status: 403 },
          );
        if (
          url.pathname === '/api/production/threads' &&
          request.method === 'POST'
        ) {
          const existingIdentity = readIdentity(
            request.headers.get('cookie') ?? undefined,
            options.secret,
          );
          const cookie = existingIdentity
            ? (request.headers.get('cookie') ?? '')
            : issueIdentity(options.secret);
          const wrapped = new Request(request, {
            headers: { ...Object.fromEntries(request.headers), cookie },
          });
          const created = await internal(wrapped, '/threads', {});
          if (!created.ok) return created;
          const thread = await created.json();
          const principal = readIdentity(cookie, options.secret);
          if (!principal) throw new Error('Identity signing failed');
          await applications.create(thread.thread_id, principal.id);
          return Response.json(
            { threadId: thread.thread_id },
            {
              headers: {
                ...(!existingIdentity
                  ? {
                      'Set-Cookie': `${cookie}; HttpOnly; SameSite=Strict; Path=/${origin.startsWith('https:') ? '; Secure' : ''}`,
                    }
                  : {}),
                'Cache-Control': 'no-store',
              },
            },
          );
        }
        const principal = readIdentity(
          request.headers.get('cookie') ?? undefined,
          options.secret,
        );
        if (!principal)
          return Response.json({ error: 'Thread not found' }, { status: 404 });
        if (
          url.pathname === '/api/production/run' &&
          request.method === 'POST'
        ) {
          let input;
          try {
            const text = await request.text();
            if (text.length > 128_000) throw new Error('Too large');
            input = validateRun(JSON.parse(text));
          } catch {
            return Response.json(
              { error: 'Invalid bounded run' },
              { status: 400 },
            );
          }
          if (
            (await applications.binding(input.threadId, principal.id)) !==
            'recording-plan-v1'
          )
            return Response.json(
              { error: 'Thread not found' },
              { status: 404 },
            );
          const response = await internal(
            request,
            '/agui/%2Frecording-plan-v1%23agent',
            input,
          );
          const headers = new Headers(response.headers);
          headers.set('X-Workbench-Source', 'provider');
          headers.set('Cache-Control', 'no-store');
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        }
        const match = url.pathname.match(
          /^\/api\/production\/threads\/([a-zA-Z0-9_-]{1,100})\/recovery$/,
        );
        if (match && request.method === 'GET') {
          const threadId = match[1];
          if (
            (await applications.binding(threadId, principal.id)) !==
            'recording-plan-v1'
          )
            return Response.json(
              { error: 'Thread not found' },
              { status: 404 },
            );
          const admission = createPostgresRunAdmission({
            ...naming,
            pool,
            assumeMigrated: true,
          });
          try {
            if (!(await admission.tryAcquire(threadId)))
              return Response.json(
                {
                  configuration: 'recording-plan-v1',
                  disposition: 'busy',
                  snapshot: { threadId, messages: [] },
                  application: await applications.read(threadId, principal.id),
                },
                { headers: { 'Cache-Control': 'no-store' } },
              );
            const stores = buildStores(admission.pool, true);
            const thread = await stores.threadsStore.getThread(threadId);
            if (
              (
                thread?.metadata['b4:access'] as
                  { ownerId?: string } | undefined
              )?.ownerId !== principal.id
            )
              return Response.json(
                { error: 'Thread not found' },
                { status: 404 },
              );
            const tuple = await stores.checkpointer.getTuple({
              configurable: { thread_id: threadId, checkpoint_ns: '' },
            });
            const application = await createApplicationStore(
              admission.pool,
            ).read(threadId, principal.id);
            if (!thread || !application)
              return Response.json(
                { error: 'Thread not found' },
                { status: 404 },
              );
            if (tuple) {
              const stamp = (tuple.metadata as Record<string, unknown>)?.[
                'b4:checkpoint-routes'
              ] as { checkpointId?: string; routes?: string[] } | undefined;
              if (
                stamp?.checkpointId !== tuple.checkpoint.id ||
                stamp.routes?.length !== 1 ||
                stamp.routes[0] !== '/recording-plan-v1#agent'
              )
                throw new Error('Unsupported checkpoint configuration');
            }
            const messages = tuple
              ? projectMessages(tuple.checkpoint.channel_values.messages ?? [])
              : [];
            const interrupts = projectInterrupts(tuple?.pendingWrites ?? []);
            if (
              interrupts.some(
                (interrupt) =>
                  !messages.some(
                    (message) =>
                      message.role === 'assistant' &&
                      message.toolCalls?.some(
                        (call) => call.id === interrupt.toolCallId,
                      ),
                  ),
              )
            )
              throw new Error('Unbound interrupt');
            const grantRecords = await Promise.all(
              interrupts.map((interrupt) =>
                stores.grants.get(threadId, interrupt.id),
              ),
            );
            const grantsCurrent = (
              await Promise.all(
                interrupts.map(async (interrupt, index) => {
                  const record = grantRecords[index];
                  const grant = interrupt.metadata?.['grant'];
                  const pendingWrite = tuple?.pendingWrites?.find(
                    (write) =>
                      write[1] === '__interrupt__' &&
                      (write[2] as { value?: { interruptId?: string } })?.value
                        ?.interruptId === interrupt.id,
                  );
                  const parkedTaskNamespace = pendingWrite
                    ? `tools:${pendingWrite[0]}`
                    : undefined;
                  return Boolean(
                    record &&
                    record.checkpointNs === parkedTaskNamespace &&
                    !record.consumedAt &&
                    !record.voidedAt &&
                    (!record.expiresAt ||
                      Date.parse(record.expiresAt) > Date.now()) &&
                    typeof grant === 'string' &&
                    timingSafeHexEqual(
                      record.tokenHash,
                      await hashApprovalGrant(grant),
                    ),
                  );
                }),
              )
            ).every(Boolean);
            const actionableInterrupts = grantsCurrent ? interrupts : [];
            const disposition =
              !grantsCurrent || thread.status === 'busy'
                ? 'unknown'
                : interrupts.length
                  ? 'paused'
                  : thread.status === 'interrupted'
                    ? 'unknown'
                    : 'idle';
            return Response.json(
              {
                configuration: 'recording-plan-v1',
                disposition,
                snapshot: {
                  threadId,
                  messages,
                  state: application,
                  ...(actionableInterrupts.length
                    ? { interrupts: actionableInterrupts }
                    : {}),
                },
                application,
              },
              { headers: { 'Cache-Control': 'no-store' } },
            );
          } catch {
            return Response.json(
              {
                error:
                  'Unsupported or inconsistent recovery history. Reread status.',
              },
              { status: 409 },
            );
          } finally {
            await admission.close();
          }
        }
        return Response.json({ error: 'Not found' }, { status: 404 });
      },
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
