import { Signal } from '@angular/core';

export type SignalLike<T> = T | Signal<T>;

export type Json =
  | string
  | undefined
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json }
  | { [key: number]: Json };
