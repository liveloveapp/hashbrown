import type { Meta, StoryObj } from '@storybook/react';
import { Scene } from './Scene';

const meta = {
  title: 'Views/ScenesView/Scene',
  component: Scene,
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
} satisfies Meta<typeof Scene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    scene: {
      id: 'scene-1',
      name: 'Movie Night',
      lights: [
        { lightId: 'light-1', brightness: 30 },
        { lightId: 'light-2', brightness: 50 },
        { lightId: 'light-3', brightness: 20 },
      ],
    },
  },
};
