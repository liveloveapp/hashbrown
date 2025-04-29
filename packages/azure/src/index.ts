import { AzureClient, text } from './stream/text.fn';

export const HashbrownAzure: AzureClient = {
  stream: {
    text,
  },
};
