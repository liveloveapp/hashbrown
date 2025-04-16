import type { Preview } from '@storybook/react';
import React from 'react';
import { Toaster } from '../src/app/shared/toaster';
//import { withRouter } from 'storybook-addon-remix-react-router';
import '../src/styles.css';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        method: 'alphabetical',
      },
    },
  },
  decorators: [
    //withRouter,
    (Story, context) => {
      const selectedTheme = context.globals.theme || 'light';
      return (
        <>
          <Toaster />
          {/* <ThemeProvider defaultTheme={selectedTheme}>
            <div className="bg-background"> */}
          <Story />
          {/* </div>
          </ThemeProvider> */}
        </>
      );
    },
  ],
};

export default preview;
