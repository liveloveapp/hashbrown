import { createWorkbenchAppFromEnv } from './workbench-env';

// The hosted workbench's one Vercel function: every /api/workbench/* route.
// Static pages are served by Vercel, not Express. Fluid compute shares one
// instance across requests, so admission is wider than the local server's.
export default createWorkbenchAppFromEnv(process.env, { maxActive: 16 });
