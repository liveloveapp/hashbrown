import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createWorkbenchStore } from '../../runtime/workbench';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import {
  mountWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';

/** Owns one recipe capture session and mounts its framework-managed conversation shell. */
export function useRecipeWorkbench(
  format: 'text' | 'predictions' | 'selection',
  active: boolean,
  navigation: WorkbenchNavigation,
) {
  const [store] = useState(() => createWorkbenchStore(format));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountWorkbench> | null>(null);
  const [live, setLive] = useState<HTMLElement | null>(null);
  const commands = useRef({
    send: (prompt: string) => {
      void prompt; /* Initialized before shell events. */
    },
    stop: () => {
      /* Initialized before shell events. */
    },
    reset: () => {
      /* Initialized before shell events. */
    },
  });
  useEffect(() => {
    if (!host.current) return;
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      lesson: getWorkbenchLesson(window.location.search),
      managedChat: true,
      send: (prompt) => commands.current.send(prompt),
      stop: () => commands.current.stop(),
      reset: () => commands.current.reset(),
    });
    mounted.current = shell;
    setLive(shell.live);
    return () => {
      commands.current.stop();
      shell.dispose();
      mounted.current = null;
    };
  }, [store]);
  useLayoutEffect(() => {
    if (!active) {
      commands.current.stop();
      mounted.current?.pause();
    }
  }, [active]);
  useEffect(() => {
    mounted.current?.navigation(navigation);
  }, [navigation, live]);
  return { store, snapshot, host, live, commands };
}
