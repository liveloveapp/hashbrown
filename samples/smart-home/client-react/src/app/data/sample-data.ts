import { Light } from '../models/light.model';
import { Scene } from '../models/scene.model';
import { ScheduledScene } from '../models/scheduled-scene.model';

export const sampleLights: Light[] = [
  { id: '1', name: 'Living Room Light', brightness: 80 },
  { id: '2', name: 'Kitchen Light', brightness: 60 },
  { id: '3', name: 'Bedroom Light', brightness: 40 },
  { id: '4', name: 'Bathroom Light', brightness: 100 },
  { id: '5', name: 'Office Light', brightness: 50 },
  { id: '7', name: 'Kitchen Sink', brightness: 100 },
  { id: '8', name: 'Kitchenette Light', brightness: 50 },
];

export const sampleScenes: Scene[] = [
  {
    id: '1',
    name: 'Morning',
    lights: [
      { lightId: '1', brightness: 100 },
      { lightId: '2', brightness: 80 },
      { lightId: '3', brightness: 0 },
      { lightId: '4', brightness: 100 },
    ],
  },
  {
    id: '2',
    name: 'Evening',
    lights: [
      { lightId: '1', brightness: 50 },
      { lightId: '2', brightness: 30 },
      { lightId: '3', brightness: 20 },
      { lightId: '4', brightness: 0 },
    ],
  },
  {
    id: '3',
    name: 'Night',
    lights: [
      { lightId: '1', brightness: 0 },
      { lightId: '2', brightness: 0 },
      { lightId: '3', brightness: 10 },
      { lightId: '4', brightness: 0 },
    ],
  },
];

export const sampleScheduledScenes: ScheduledScene[] = [
  {
    id: '1',
    sceneId: '1',
    startDate: new Date(2023, 0, 1, 7, 0, 0), // 7:00 AM
    recurrenceRule: {
      weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    },
    isEnabled: true,
  },
  {
    id: '2',
    sceneId: '2',
    startDate: new Date(2023, 0, 1, 18, 0, 0), // 6:00 PM
    recurrenceRule: {
      weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    },
    isEnabled: true,
  },
  {
    id: '3',
    sceneId: '3',
    startDate: new Date(2023, 0, 1, 22, 0, 0), // 10:00 PM
    recurrenceRule: {
      weekdays: [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ],
    },
    isEnabled: true,
  },
];
