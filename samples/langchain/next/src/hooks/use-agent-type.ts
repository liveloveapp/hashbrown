import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useCallback } from 'react';

export type AgentType = 'langgraph' | 'copilotkit';

export const useAgentType = () => {
  const router = useRouter();
  const pathname = usePathname();

  const agentType = useMemo<AgentType>(() => {
    if (pathname === '/langgraph') {
      return 'langgraph';
    }
    if (pathname === '/copilotkit') {
      return 'copilotkit';
    }
    // Default fallback
    return 'langgraph';
  }, [pathname]);

  const setAgentType = useCallback(
    (next: AgentType) => {
      const route = next === 'langgraph' ? '/langgraph' : '/copilotkit';
      router.push(route);
    },
    [router],
  );

  return { agentType, setAgentType };
};
