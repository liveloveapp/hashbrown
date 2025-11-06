import type { AWS } from '@serverless/typescript';

// Helpful when running in CI/CD
const stage = process.env.STAGE ?? 'dev';
const serviceName = `nx-lambdas-hello-${stage}`;

const serverlessConfiguration: AWS = {
  service: serviceName,
  frameworkVersion: '3',
  configValidationMode: 'error',
  plugins: [
    'serverless-esbuild',
    'serverless-offline',
    'serverless-prune-plugin',
  ],
  provider: {
    name: 'aws',
    runtime: 'nodejs20.x',
    region: process.env.AWS_REGION ?? 'us-east-1',
    stage,
    logRetentionInDays: 7,
    environment: {
      NODE_OPTIONS: '--enable-source-maps',
    },
    iam: {
      role: {
        statements: [
          // Example IAM permission (remove if not needed)
          // { Effect: 'Allow', Action: ['s3:ListAllMyBuckets'], Resource: '*' },
        ],
      },
    },
    httpApi: {
      // Simple CORS; customize as needed
      cors: true,
      // or:
      // cors: {
      //   allowedOrigins: ['http://localhost:3000'],
      //   allowedHeaders: ['content-type', 'authorization'],
      //   allowedMethods: ['POST', 'OPTIONS'],
      // }
    },
  },
  functions: {
    hello: {
      handler: 'apps/lambdas-hello/src/handlers/hello.handler',
      // Example HTTP endpoint via API Gateway v2 (HTTP API)
      events: [{ httpApi: { method: 'GET', path: '/hello' } }],
      // Per-function env/iam can go here if preferred
    },
  },
  package: {
    individually: true,
    patterns: ['!**/*.test.*', '!**/__tests__/**', '!**/*.spec.*', '!**/*.map'],
  },
  custom: {
    prune: { automatic: true, number: 3 },
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      target: 'node20',
      platform: 'node',
      tsconfig: 'apps/lambdas-hello/tsconfig.app.json',
      exclude: ['@aws-sdk/*'], // let esbuild bundle these unless you prefer external
      // If your monorepo has internal libs you want to include:
      // define: { 'process.env.STAGE': JSON.stringify(stage) },
    },
    'serverless-offline': { httpPort: 4000 },
  },
};

module.exports = serverlessConfiguration;
