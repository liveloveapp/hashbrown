import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';

type CreateItemInput = {
  name: string;
  description?: string;
};

const CreateItem = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // API Gateway HTTP API v2 sends JSON in event.body (string | undefined)
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing request body' }),
    };
  }

  let payload: CreateItemInput;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Body must be valid JSON' }),
    };
  }

  const parsed = CreateItem.safeParse(payload);
  if (!parsed.success) {
    return {
      statusCode: 422,
      body: JSON.stringify({ error: parsed.error.flatten() }),
    };
  }

  if (!payload.name || typeof payload.name !== 'string') {
    return {
      statusCode: 422,
      body: JSON.stringify({
        error: '`name` is required and must be a string',
      }),
    };
  }

  // Pretend to create the item (e.g., write to DynamoDB)
  const id = crypto.randomUUID();

  // Return a 201 Created with the new resource
  return {
    statusCode: 201,
    headers: {
      'content-type': 'application/json',
      // Optional: Location header for RESTful creation semantics
      Location: `/items/${id}`,
    },
    body: JSON.stringify({
      id,
      name: payload.name,
      description: payload.description ?? null,
      createdAt: new Date().toISOString(),
    }),
  };
};
