import type { ReactNode } from 'react';
import type { Type } from '@angular/core';
import { Prettify } from '../utils';
import { s } from '../schema';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
interface AngularLikeComponent<T> extends Function {
  new (...args: any[]): T;
}

export type ReactLikeComponent<T> = {
  (props: T): ReactNode;
};

export type Component<T> = AngularLikeComponent<T> | ReactLikeComponent<T>;

type AngularSignalLike<T> = () => T;

export type ComponentPropSchema<T> = Prettify<
  T extends AngularLikeComponent<infer P>
    ? {
        [K in keyof P]?: P[K] extends AngularSignalLike<infer U>
          ? s.Schema<U>
          : never;
      }
    : T extends ReactLikeComponent<infer P>
      ? {
          [K in keyof P]?: s.Schema<P[K]>;
        }
      : never
>;

export interface ExposedComponent<T extends Component<unknown>> {
  component: T;
  name: string;
  description: string;
  children?: 'any' | ExposedComponent<any>[] | false;
  props?: ComponentPropSchema<T>;
}
