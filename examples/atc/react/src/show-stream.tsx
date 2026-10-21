import { createContext, type ReactNode, useContext } from 'react';

const ShowStreamContext = createContext(false);

/**
 * Provides whether "Show the stream" is on to the transcript, the tool lines
 * and the map. Without a provider it is off, so components render unchanged.
 */
export function ShowStreamProvider({
  on,
  children,
}: {
  on: boolean;
  children: ReactNode;
}) {
  return (
    <ShowStreamContext.Provider value={on}>
      {children}
    </ShowStreamContext.Provider>
  );
}

/** Whether "Show the stream" is on. */
export function useShowStream(): boolean {
  return useContext(ShowStreamContext);
}
