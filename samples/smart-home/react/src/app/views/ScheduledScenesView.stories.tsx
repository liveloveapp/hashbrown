import type { Meta, StoryObj } from '@storybook/react';
import { ScheduledScenesView } from './ScheduledScenesView';

const meta = {
  title: 'Views/ScheduledScenesView',
  component: ScheduledScenesView,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScheduledScenesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    scheduledScenes: [
      {
        id: 'scheduled-scene-1',
        sceneId: 'scene-1',
        startDate: new Date('2023-01-01T20:00:00'),
        recurrenceRule: {
          weekdays: ['monday', 'wednesday', 'friday'],
        },
        isEnabled: true,
      },
      {
        id: 'scheduled-scene-2',
        sceneId: 'scene-2',
        startDate: new Date('2023-01-01T22:00:00'),
        isEnabled: true,
      },
      {
        id: 'scheduled-scene-3',
        sceneId: 'scene-3',
        startDate: new Date('2023-01-01T06:00:00'),
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
    ],
  },
};
