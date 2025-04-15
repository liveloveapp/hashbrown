import type { Meta, StoryObj } from '@storybook/react';
import { PredictiveTextArea } from './PredictiveTextArea';

const meta = {
  title: 'Shared/PredictiveTextArea',
  component: PredictiveTextArea,
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
} satisfies Meta<typeof PredictiveTextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
