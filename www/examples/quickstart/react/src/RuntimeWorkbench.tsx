import { useRuntime, useRuntimeFunction } from '@hashbrownai/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createWorkbenchStore } from '../../runtime/workbench';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import {
  workbenchJavaScriptPlanResultSchema,
  workbenchJavaScriptReadPlanSchema,
} from '../../runtime/workbench-javascript';
import {
  createWorkbenchJavaScriptSession,
  mountWorkbenchJavaScriptSession,
} from '../../runtime/workbench-javascript-session';
import {
  mountWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';

/** Runs explicit visible scripts through React's native Hashbrown QuickJS hooks. */
export function RuntimeWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const [store] = useState(() => createWorkbenchStore('text'));
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ active, navigation });
  const controller = useRef<ReturnType<
    typeof createWorkbenchJavaScriptSession
  > | null>(null);
  const mounted = useRef<{
    shell: ReturnType<typeof mountWorkbench>;
    controls: ReturnType<typeof mountWorkbenchJavaScriptSession>;
  } | null>(null);
  const read = useRuntimeFunction({
    name: 'readPlan',
    description:
      'Read the application-owned plan at the exact current revision without changing it.',
    args: workbenchJavaScriptReadPlanSchema,
    result: workbenchJavaScriptPlanResultSchema,
    handler: async (args, signal) => {
      if (!controller.current)
        throw new Error('Runtime conversation is not mounted');
      return controller.current.readPlan(args, signal);
    },
    deps: [],
  });
  const runtime = useRuntime({ functions: [read], timeout: 1_000 });
  const runtimeRef = useRef(runtime);
  useLayoutEffect(() => {
    current.current = { active, navigation };
    runtimeRef.current = runtime;
    if (!active) {
      controller.current?.stop();
      mounted.current?.shell.pause();
    }
    mounted.current?.controls.update();
    mounted.current?.shell.navigation(navigation);
  });
  useEffect(() => {
    if (!host.current) return;
    const session = createWorkbenchJavaScriptSession({
      store,
      active: () => current.current.active,
      execute: (code, signal) => runtimeRef.current.run(code, signal),
    });
    controller.current = session;
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      managedChat: true,
      lesson: getWorkbenchLesson(window.location.search),
      send: (code) => {
        void session.run(code);
      },
      stop: () => session.stop(),
      reset: () => current.current.navigation.create(),
    });
    const controls = mountWorkbenchJavaScriptSession(
      shell.live,
      store,
      session,
    );
    mounted.current = { shell, controls };
    shell.navigation(current.current.navigation);
    return () => {
      session.dispose();
      controls.dispose();
      shell.dispose();
      controller.current = null;
      mounted.current = null;
    };
  }, [store]);
  return <div ref={host} />;
}
