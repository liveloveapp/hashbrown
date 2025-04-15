import type { Meta, StoryObj } from '@storybook/react';
import { ChatPanel } from './ChatPanel';

const meta = {
  title: 'Shared/ChatPanel',
  component: ChatPanel,
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
} satisfies Meta<typeof ChatPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
