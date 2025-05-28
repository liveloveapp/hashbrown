import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

interface ConfigState {
  provider: string;
  apiKey: string;
}

const initialState: ConfigState = {
  provider: 'openai',
  apiKey: '',
};

export const ConfigStore = signalStore(
  withState(initialState),
  withMethods((store) => ({
    setApiKey(apiKey: ConfigState['apiKey']) {
      patchState(store, (state): ConfigState => ({ ...state, apiKey }));
    },
    setProvider(provider: ConfigState['provider']) {
      patchState(store, (state): ConfigState => ({ ...state, provider }));
    },
  })),
);
