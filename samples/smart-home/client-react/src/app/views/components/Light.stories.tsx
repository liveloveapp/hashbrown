import type { Meta, StoryObj } from '@storybook/react';
import { Light } from './Light';

const meta = {
  title: 'Views/LightsView/Light',
  component: Light,
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
} satisfies Meta<typeof Light>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    light: {
      name: 'Living Room',
      brightness: 75,
    },
  },
};
