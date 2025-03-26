import { Observable } from 'rxjs';
import { z } from 'zod';
import { Tool } from './types';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JSONSchema } from 'openai/lib/jsonschema';

export class BoundTool<
  Name extends string = string,
  Schema extends z.ZodTypeAny = z.ZodTypeAny,
  Output extends object = object
> {
  constructor(
    readonly name: Name,
    readonly description: string,
    readonly schema: Schema,
    readonly handler: (
      input: z.infer<Schema>
    ) => Promise<Output> | Observable<Output>
  ) {}

  toTool(): Tool<Name> {
    return {
      name: this.name,
      description: this.description,
      schema: zodToJsonSchema(this.schema) as unknown as JSONSchema,
    };
  }
}

export function createTool<
  Name extends string,
  Schema extends z.ZodTypeAny = z.ZodTypeAny,
  Output extends object = object
>(input: {
  name: Name;
  description: string;
  schema: Schema;
  handler: (input: z.infer<Schema>) => Promise<Output> | Observable<Output>;
}) {
  return new BoundTool(
    input.name,
    input.description,
    input.schema,
    input.handler
  );
}
