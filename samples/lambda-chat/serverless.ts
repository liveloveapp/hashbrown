import type { AWS } from '@serverless/typescript';

const stage = process.env.STAGE ?? 'dev';
const serviceName = `lambda-chat-${stage}`;

const serverlessConfiguration: AWS = {
  service: serviceName,
  frameworkVersion: '4',
  configValidationMode: 'error',
  plugins: ['serverless-offline', 'serverless-prune-plugin'],
  provider: {
    name: 'aws',
    runtime: 'nodejs20.x',
    region: process.env.AWS_REGION ?? 'us-east-1',
    stage,
    logRetentionInDays: 7,
    environment: {
      NODE_OPTIONS: '--enable-source-maps',
      // Serverless v4 loads vars from .env files by default without
      // additional plugins
      OPENAI_API_KEY: '${env:OPENAI_API_KEY}',
    },
    iam: {
      role: {
        statements: [],
      },
    },
  },
  functions: {
    chat: {
      handler: 'src/chat.handler',
      url: {
        invokeMode: 'RESPONSE_STREAM',
        // Add 'authorizer' set to 'aws_iam' for SigV4-signed requests.
        cors: {
          allowedOrigins: ['*'], // tighten for production
          allowedMethods: ['POST'],
          allowedHeaders: ['Content-Type', 'Authorization'],
          allowCredentials: false,
          maxAge: 86400,
        },
      },
    },
  },
  package: {
    individually: true,
    patterns: ['!**/*.test.*', '!**/__tests__/**', '!**/*.spec.*', '!**/*.map'],
  },
  custom: {
    prune: { automatic: true, number: 3 },
    'serverless-offline': { httpPort: 4000 },
  },
};

module.exports = serverlessConfiguration;
