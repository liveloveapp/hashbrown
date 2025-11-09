# Hashbrown "Chat from a lambda" Example

This example demonstrates how to use Hashbrown to provide streaming responses from an AWS Lambda function. The example uses Function URLs to invoke the lambda, because API Gateway does not support streaming directly. Since you cannot stream responses from a lambda in a VPC, lambdas using this mechanism cannot be in a VPC. Since all this lambda does is access another service (the LLM provider), that is acceptable. Your mileage may vary, and, if it does, let us know. We can potentially create additional examples using other methods.

### Using serverless v4

This example is not meant to serve as a tutorial for serverless (since, well, serverless makes those). That said, you'll need credentials to deploy the lambda. There are a variety of ways to obtain those credentials based on your organization's IT infrastructure and policies. This example uses the simplest (though not the most robust) mechanism: IAM long-lasting credentials.

Those can be provided to serverless via:

```
serverless login
```

### Setting .env for deployment

This example uses a `.env` in the repo's top-level to provide env vars.

For example, the to deploy the lambda, you'll need 3 entries in your .env file:

```
OPENAI_API_KEY=<your key>

STAGE=development
AWS_REGION=us-east-1
```

### Deploying the lambda

You can deploy the lambda by using nx from the top of the repo:

```
npx nx run lambda-chat:deploy
```

### Where to find the Function URL

In the AWS Console -> Lambda -> Functions -> (your function name) view, the Function URL can be found in the right-hand side near Function ARN and Application.

### Configuring Hashbrown UI providers to target the lambda's URL

In Angular, in your ApplicationConfig providers list, set the provideHashbrown baseUrl parameter to the Function URL.

```
# Abridged example from `samples/smart-home/angular`
export const appConfig: ApplicationConfig = {
  providers: [
    provideHashbrown({
      baseUrl:
        'https://<generated-id-stuff>.lambda-url.us-east-1.on.aws/',
    }),
  ],
};

```

In React, in the component where you use HashbrownProvider, pass the Function URL to the HashbrownProvider provider:

```
# Abridged example from `samples/smart-home/react`

export function App() {
  const url = 'https://<generated-id-stuff>.lambda-url.us-east-1.on.aws/';

  return (
    <HashbrownProvider url={url}>
      <!-- The rest of your app -->
    </HashbrownProvider>
  )
}
```

### Things You'd Do In Production

- narrow the allowed-origins list in the CORS config block in serverless.ts
- front the function URL in CloudFront to
  - provide a cleaner public URL
  - enable various protections (i.e. origin access control)
