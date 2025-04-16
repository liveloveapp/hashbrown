import type { Meta, StoryObj } from '@storybook/react';
import { ScenesView } from './ScenesView';

const meta = {
  title: 'Views/ScenesView',
  component: ScenesView,
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
} satisfies Meta<typeof ScenesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    scenes: [
      {
        id: 'scene-1',
        name: 'Movie Night',
        lights: [
          { lightId: 'light-1', brightness: 30 },
          { lightId: 'light-2', brightness: 50 },
          { lightId: 'light-3', brightness: 20 },
        ],
      },
      {
        id: 'scene-2',
        name: 'Morning Routine',
        lights: [
          { lightId: 'light-1', brightness: 100 },
          { lightId: 'light-2', brightness: 80 },
        ],
      },
      {
        id: 'scene-3',
        name: 'Evening Relaxation',
        lights: [
          { lightId: 'light-1', brightness: 40 },
          { lightId: 'light-2', brightness: 30 },
          { lightId: 'light-3', brightness: 25 },
        ],
      },
    ],
  },
};
