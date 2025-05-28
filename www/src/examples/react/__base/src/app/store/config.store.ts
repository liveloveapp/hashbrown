import { create } from 'zustand';
import { combine } from 'zustand/middleware';

interface ConfigStore {
  provider: string;
  apiKey: string;
}

export const useConfigStore = create<ConfigStore>(
  combine(
    {
      provider: 'openai',
      apiKey: '',
    },
    (set) => ({
      setProvider: (provider: string) => set({ provider }),
      setApiKey: (apiKey: string) => set({ apiKey }),
    }),
  ),
);
