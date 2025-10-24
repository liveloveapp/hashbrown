import { Chat, s } from '@hashbrownai/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * @public
 */
export interface LensOptions<
  Name extends string,
  Schema extends s.HashbrownType,
> {
  /**
   * The name of the lens.
   */
  name: Name;

  /**
   * The description of the lens. This helps the LLM understand its purpose.
   */
  description: string;

  /**
   * The schema that describes the value for the lens.
   */
  schema: Schema;

  /**
   * The read function of the lens. This is what the LLM agent will call
   * to get the current value of the lens.
   */
  read?: () => s.Infer<Schema>;

  /**
   * The write function of the lens. This is what the LLM agent will call
   * to update the value of the lens.
   */
  write?: (value: s.Infer<Schema>) => void;
}

export function useLens<const Name extends string>(
  input: LensOptions<Name, s.HashbrownType>,
): Chat.Lens<Name, s.HashbrownType> {
  const { name, description, read, write } = input;

  // we only want to update the schema if it actually changes
  const [schema, setSchema] = useState(
    'schema' in input ? input.schema : s.object('Empty schema', {}),
  );
  useEffect(() => {
    const currentJson = schema.toJsonSchema();
    const inputJson = input.schema.toJsonSchema();
    if (JSON.stringify(currentJson) !== JSON.stringify(inputJson)) {
      setSchema(input.schema);
    }
  });

  const lens = useMemo(() => {
    return {
      name,
      description,
      schema,
      read,
      write,
    };
    // note that we do not include read and write in the deps array.
    // this enables anonymous functions to be passed in without
    //   causing unnecessary re-creations of the lens.
  }, [name, description, schema]);

  return lens;
}
