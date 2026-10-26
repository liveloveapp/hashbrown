/** Builds shared ATC state stores on one bounded Postgres pool. */
export async function createSharedAgentStores(connectionString: string) {
  const {
    createPostgresPool,
    postgresCheckpointer,
    createPostgresThreadsStore,
    createPostgresClientToolCallStore,
  } = await import('@b4run/postgres-storage/node');
  const pool = createPostgresPool({ connectionString, max: 5 });
  const options = { pool, tablePrefix: 'atc' };
  const checkpointer = postgresCheckpointer(options);
  const threads = createPostgresThreadsStore(options);
  const clientTools = createPostgresClientToolCallStore(options);
  const close = async () => {
    await pool.end();
  };
  try {
    await Promise.all([
      checkpointer.ready(),
      threads.ready(),
      clientTools.ready(),
    ]);
    return { checkpointer, threads, clientTools, close };
  } catch (error) {
    await close();
    throw error;
  }
}
