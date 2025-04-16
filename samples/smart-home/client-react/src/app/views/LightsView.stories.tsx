import type { Meta, StoryObj } from '@storybook/react';
import { LightsView } from './LightsView';

const meta = {
  title: 'Views/LightsView',
  component: LightsView,
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
} satisfies Meta<typeof LightsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    lights: [
      {
        id: '1',
        name: 'Living Room',
        brightness: 75,
      },
      {
        id: '2',
        name: 'Kitchen',
        brightness: 50,
      },
      {
        id: '3',
        name: 'Bathroom',
        brightness: 25,
      },
      {
        id: '4',
        name: 'That Tiny Light in the Bathroom',
        brightness: 100,
      },
    ],
  },
};
