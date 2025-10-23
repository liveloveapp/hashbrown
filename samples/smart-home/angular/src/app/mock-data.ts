import { Light, Scene } from './types';

export const mockLights: Light[] = [
  {
    id: 'light-1',
    name: 'Living Room - Ambient 1',
    brightness: 100,
  },
  {
    id: 'light-2',
    name: 'Living Room - Ambient 2',
    brightness: 100,
  },
  {
    id: 'light-3',
    name: 'Living Room - Standing Lamp',
    brightness: 100,
  },
  {
    id: 'light-4',
    name: 'Bedroom - Left Nightstand',
    brightness: 100,
  },
  {
    id: 'light-5',
    name: 'Bedroom - Right Nightstand',
    brightness: 100,
  },
  {
    id: 'light-6',
    name: 'Bedroom - Overhead',
    brightness: 100,
  },
];

export const mockScenes: Scene[] = [
  {
    id: 'scene-1',
    name: 'Living Room - On',
    lights: [
      {
        lightId: 'light-1',
        brightness: 100,
      },
      {
        lightId: 'light-2',
        brightness: 100,
      },
      {
        lightId: 'light-3',
        brightness: 100,
      },
    ],
  },
  {
    id: 'scene-2',
    name: 'Living Room - Off',
    lights: [
      {
        lightId: 'light-1',
        brightness: 0,
      },
      {
        lightId: 'light-2',
        brightness: 0,
      },
      {
        lightId: 'light-3',
        brightness: 0,
      },
    ],
  },
  {
    id: 'scene-3',
    name: 'Living Room - Chill',
    lights: [
      {
        lightId: 'light-1',
        brightness: 30,
      },
      {
        lightId: 'light-2',
        brightness: 30,
      },
      {
        lightId: 'light-3',
        brightness: 30,
      },
    ],
  },
  {
    id: 'scene-4',
    name: 'Bedroom - On',
    lights: [
      {
        lightId: 'light-4',
        brightness: 100,
      },
      {
        lightId: 'light-5',
        brightness: 100,
      },
      {
        lightId: 'light-6',
        brightness: 100,
      },
    ],
  },
  {
    id: 'scene-5',
    name: 'Bedroom - Off',
    lights: [
      {
        lightId: 'light-4',
        brightness: 0,
      },
      {
        lightId: 'light-5',
        brightness: 0,
      },
      {
        lightId: 'light-6',
        brightness: 0,
      },
    ],
  },
  {
    id: 'scene-6',
    name: 'Bedroom - Chill',
    lights: [
      {
        lightId: 'light-4',
        brightness: 30,
      },
      {
        lightId: 'light-5',
        brightness: 30,
      },
      {
        lightId: 'light-6',
        brightness: 30,
      },
    ],
  },
];
