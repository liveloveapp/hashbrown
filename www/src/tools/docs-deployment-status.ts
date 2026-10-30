/** Emits only the GitHub status fields used by the deployment workflow. */
import { deploymentStatus } from '../lib/docs-deployment';

process.stdout.write(
  JSON.stringify(
    deploymentStatus({
      environment:
        process.env.ENVIRONMENT === 'production' ? 'production' : 'preview',
      target: process.env.KEY ?? '',
      deploy: process.env.OUTCOME ?? '',
      verification: process.env.VERIFICATION_OUTCOME ?? '',
      cancelled: process.env.DEPLOYMENT_CANCELLED === 'true',
    }),
  ),
);
