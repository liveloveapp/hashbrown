import { VendorClient } from '@hashbrownai/core';
import { text } from './stream/text.fn';

export const HashbrownAzure: VendorClient = {
  stream: {
    text,
  },
};
