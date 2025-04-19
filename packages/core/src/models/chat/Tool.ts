import { ToolSchema } from './ToolSchema';

export type Tool<
  Name extends string = string,
  Schema extends ToolSchema = ToolSchema,
> = {
  name: Name;
  description: string;
  schema: Schema;
};
