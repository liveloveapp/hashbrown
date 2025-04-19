import { ChatProvider } from '@hashbrownai/react';
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
      <ChatProvider
        model="gpt-4o-mini"
        temperature={0.5}
        tools={[]}
        maxTokens={1000}
      >
        <div className="p-4">
          <Story />
        </div>
      </ChatProvider>
    ),
  ],
} satisfies Meta<typeof ChatPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
