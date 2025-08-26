import type { Meta, StoryObj } from '@storybook/react';
import { SceneLight } from './SceneLight';

const meta: Meta<typeof SceneLight> = {
  title: 'Components/SceneLight',
  component: SceneLight,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SceneLight>;

export const Default: Story = {
  args: {
    name: 'Living Room Light',
    sceneLight: {
      lightId: 'light-1',
      brightness: 75,
    },
  },
};

export const FullBrightness: Story = {
  args: {
    name: 'Kitchen Light',
    sceneLight: {
      lightId: 'light-2',
      brightness: 100,
    },
  },
};

export const DimLight: Story = {
  args: {
    name: 'Bedroom Light',
    sceneLight: {
      lightId: 'light-3',
      brightness: 25,
    },
  },
};

export const WithCallbacks: Story = {
  args: {
    name: 'Bathroom Light',
    sceneLight: {
      lightId: 'light-4',
      brightness: 50,
    },
    onEdit: (lightId, brightness) =>
      console.log(`Light ${lightId} brightness changed to: ${brightness}`),
    onRemove: (lightId) => console.log(`Light ${lightId} removed`),
  },
};
