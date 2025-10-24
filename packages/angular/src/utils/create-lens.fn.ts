import {
  inject,
  Injector,
  runInInjectionContext,
  untracked,
} from '@angular/core';
import { Chat, s } from '@hashbrownai/core';

export function createLens<
  Name extends string,
  Schema extends s.HashbrownType,
>(input: {
  name: Name;
  description: string;
  schema: Schema;
  read?: () => s.Infer<Schema>;
  write?: (value: s.Infer<Schema>) => void;
}): Chat.Lens<Name, Schema> {
  const injector = inject(Injector);
  const lens: Chat.Lens<Name, Schema> = {
    name: input.name,
    description: input.description,
    schema: input.schema,
  };
  const { read, write } = input;

  if (read) {
    lens.read = () => {
      return runInInjectionContext(injector, () => read());
    };
  }

  if (write) {
    lens.write = (value: s.Infer<Schema>) => {
      return runInInjectionContext(injector, () => write(value));
    };
  }

  return lens;
}

export function bindLensToInjector<
  Name extends string,
  Schema extends s.HashbrownType,
  Lens extends Chat.Lens<Name, Schema>,
>(lens: Lens, injector: Injector): Lens {
  const { read, write } = lens;

  if (read) {
    lens.read = () => {
      return untracked(() => runInInjectionContext(injector, () => read()));
    };
  }

  if (write) {
    lens.write = (value: s.Infer<Schema>) => {
      return untracked(() =>
        runInInjectionContext(injector, () => write(value)),
      );
    };
  }

  return lens;
}
