import { AnyTool, Lens } from '../models/view.models';
import { s } from '../schema';

export function createLensTools(
  lenses: Lens<string, s.HashbrownType>[],
): AnyTool[] {
  const readableLenses = lenses.filter((lense) => 'read' in lense);
  const writableLenses = lenses.filter((lense) => 'write' in lense);
  const tools: AnyTool[] = [];

  if (readableLenses.length > 0) {
    tools.push({
      name: 'read_state',
      description: 'Read application state',
      schema: s.object('Read State Input', {
        read: s.anyOf(
          readableLenses.map((lense) => {
            return s.object(lense.description, {
              key: s.literal(lense.name),
            });
          }),
        ),
      }),
      handler: ({ read }) => {
        const lense = lenses.find((lense) => lense.name === read['key']);

        if (!lense) {
          return Promise.reject(`No state found for key "${read['key']}"`);
        }

        if ('read' in lense && lense['read'] !== undefined) {
          return Promise.resolve(lense.read());
        }

        return Promise.reject(`State is not readable for key "${read['key']}"`);
      },
    });
  }

  if (writableLenses.length > 0) {
    tools.push({
      name: 'write_state',
      description: 'Set application state',
      schema: s.object('Write State Input', {
        write: s.anyOf(
          writableLenses.map((lense) => {
            return s.object(lense.description, {
              key: s.literal(lense.name),
              value: lense.schema,
            });
          }),
        ),
      }),
      handler: ({ write }) => {
        const lense = lenses.find((lense) => lense.name === write['key']);

        if (!lense) {
          return Promise.reject(`No state found for key "${write['key']}"`);
        }

        if ('write' in lense && lense['write'] !== undefined) {
          lense.write(write['value']);
          return Promise.resolve();
        }

        return Promise.reject(
          `State is not writable for key "${write['key']}"`,
        );
      },
    });
  }

  return tools;
}
