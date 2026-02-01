# Hashbrown Agents

This file defines how agents should work in this repository. Keep changes aligned with Hashbrown's docs and current project conventions.

## Code Quality
- Prefer immutability, POJOs, and pure functions. Avoid mutating inputs and shared state.
- Write failing tests first, then make them pass.
- Tests use top-level `test(...)` only. Do not use `describe`, `it`, `beforeEach`, or `afterEach`.
- Keep tests organized into arrange/act/assert with blank lines between sections, matching existing style.
- Any new public or reusable functionality must include a TSDoc-compliant doc block (`/** ... */`).
- Do not add new dependencies to any package without asking first.
- React best practices (from react.dev):
  - Components and hooks must be pure: no side effects during render, no mutation of props or state.
  - Follow the Rules of Hooks: call hooks at the top level and only from React components or custom hooks.
  - Avoid unnecessary `useEffect`; prefer deriving state during render and using memoization (`useMemo`/`useCallback`) only when needed for performance.
  - Keep state minimal and normalized (avoid redundant or duplicated state).
- Angular best practices (from angular.dev):
  - Follow the official style guide for naming, file organization, and consistent patterns.
  - Prefer standalone components (Angular defaults to standalone); declare dependencies via `imports` on the component.
  - Use signals for local state and derived state (`computed`) where possible; use `effect` for side effects.
  - In zoneless or OnPush scenarios, ensure UI updates are driven by signals or explicit change detection.
- Linting:
  - Prefer to fix lint errors rather than suppress them.
- If a rule must be disabled, do it per-file with a clear, minimal `eslint-disable` comment at the top.
- Core public API: Anything that is not meant for end users but must be shared across Hashbrown packages must be exported from core with the `ɵ` prefix (e.g. `ɵcreateX`, `ɵTypeX`). Do not add non-ɵ exports to core for internal-only usage.
- Public types in React/Angular should not expose `ɵ`-prefixed types in their signatures. It's okay for React/Angular to call `ɵ`-prefixed functions internally, but public type signatures must reference non-ɵ types (prefer core public types over ɵ types).

## Running builds/tests/etc
- This is an Nx monorepo.
- Use `npx nx <target> <project>` for all Nx commands.
- For any code change, run build, test, and lint for each affected package before final response. Report failures and warnings.

### Root
- `@hashbrownai/source`
  - `npx nx local-registry @hashbrownai/source`

### Packages (libraries)
- `core`
  - `npx nx build core`
  - `npx nx test core`
  - `npx nx lint core`
  - `npx nx build-api-report core`
  - `npx nx parser-test-client core`
  - `npx nx parser-test-server core`
  - `npx nx nx-release-publish core`
- `react`
  - `npx nx build react`
  - `npx nx build-api-report react`
  - `npx nx nx-release-publish react`
- `angular`
  - `npx nx build angular`
  - `npx nx test angular`
  - `npx nx lint angular`
  - `npx nx build-api-report angular`
  - `npx nx nx-release-publish angular`
- `openai`
  - `npx nx build openai`
  - `npx nx test openai`
  - `npx nx e2e openai`
  - `npx nx lint openai`
  - `npx nx build-api-report openai`
  - `npx nx nx-release-publish openai`
- `anthropic`
  - `npx nx build anthropic`
  - `npx nx test anthropic`
  - `npx nx e2e anthropic`
  - `npx nx lint anthropic`
  - `npx nx build-api-report anthropic`
  - `npx nx nx-release-publish anthropic`
- `azure`
  - `npx nx build azure`
  - `npx nx test azure`
  - `npx nx e2e azure`
  - `npx nx lint azure`
  - `npx nx build-api-report azure`
  - `npx nx nx-release-publish azure`
- `bedrock`
  - `npx nx build bedrock`
  - `npx nx test bedrock`
  - `npx nx e2e bedrock`
  - `npx nx lint bedrock`
  - `npx nx build-api-report bedrock`
  - `npx nx nx-release-publish bedrock`
- `google`
  - `npx nx build google`
  - `npx nx test google`
  - `npx nx e2e google`
  - `npx nx lint google`
  - `npx nx build-api-report google`
  - `npx nx nx-release-publish google`
- `ollama`
  - `npx nx build ollama`
  - `npx nx test ollama`
  - `npx nx e2e ollama`
  - `npx nx lint ollama`
  - `npx nx build-api-report ollama`
  - `npx nx nx-release-publish ollama`
- `writer`
  - `npx nx build writer`
  - `npx nx test writer`
  - `npx nx e2e writer`
  - `npx nx build-api-report writer`
  - `npx nx nx-release-publish writer`

### Samples / apps
- `fast-food-angular`
  - `npx nx build fast-food-angular`
  - `npx nx serve fast-food-angular`
  - `npx nx test fast-food-angular`
  - `npx nx deploy fast-food-angular`
- `fast-food-cloudflare`
  - `npx nx build fast-food-cloudflare`
  - `npx nx serve fast-food-cloudflare`
  - `npx nx generate-data fast-food-cloudflare`
- `fast-food-react`
  - No Nx targets are currently defined.
- `fast-food-server`
  - `npx nx build fast-food-server`
  - `npx nx serve fast-food-server`
  - `npx nx generate-data fast-food-server`
- `finance-angular`
  - `npx nx build finance-angular`
  - `npx nx serve finance-angular`
  - `npx nx deploy finance-angular`
- `finance-cloudflare`
  - `npx nx build finance-cloudflare`
  - `npx nx serve finance-cloudflare`
  - `npx nx generate-data finance-cloudflare`
- `finance-react`
  - No Nx targets are currently defined.
- `finance-server`
  - `npx nx build finance-server`
  - `npx nx serve finance-server`
  - `npx nx generate-data finance-server`
- `kitchen-sink-angular`
  - `npx nx build kitchen-sink-angular`
  - `npx nx serve kitchen-sink-angular`
  - `npx nx serve-static kitchen-sink-angular`
  - `npx nx extract-i18n kitchen-sink-angular`
  - `npx nx lint kitchen-sink-angular`
- `kitchen-sink-server`
  - `npx nx build kitchen-sink-server`
  - `npx nx serve kitchen-sink-server`
- `lambda-chat`
  - `npx nx deploy lambda-chat`
  - `npx nx invoke-local lambda-chat`
  - `npx nx lint lambda-chat`
  - `npx nx offline lambda-chat`
  - `npx nx package lambda-chat`
  - `npx nx remove lambda-chat`
- `smart-home-angular`
  - `npx nx build smart-home-angular`
  - `npx nx serve smart-home-angular`
  - `npx nx serve-static smart-home-angular`
  - `npx nx extract-i18n smart-home-angular`
  - `npx nx lint smart-home-angular`
  - `npx nx deploy smart-home-angular`
- `smart-home-cloudflare`
  - `npx nx build smart-home-cloudflare`
  - `npx nx serve smart-home-cloudflare`
- `smart-home-react`
  - `npx nx build smart-home-react`
- `smart-home-server`
  - `npx nx build smart-home-server`
  - `npx nx serve smart-home-server`
- `spotify-angular`
  - `npx nx build spotify-angular`
  - `npx nx serve spotify-angular`
  - `npx nx serve-static spotify-angular`
  - `npx nx extract-i18n spotify-angular`
  - `npx nx lint spotify-angular`
- `spotify-server`
  - `npx nx build spotify-server`
  - `npx nx serve spotify-server`

### Docs site
- `www`
  - `npx nx build www`
  - `npx nx serve www`
  - `npx nx test www`
  - `npx nx deploy www`
  - `npx nx collect-docs www`
  - `npx nx generate-llms www`
  - `npx nx review-docs www`
  - `npx nx translate-docs www`

## Definitions (from docs in www)
- **Hashbrown**: An open source framework for building generative user interfaces in React and Angular. It is headless, platform-agnostic, and built for streaming.
- **Generative UI**: The model renders UI by selecting from a controlled set of trusted components you explicitly expose. Hashbrown renders only those components, with props validated by schemas.
- **Skillet schema language**: A Zod-like, LLM-optimized schema language that is strongly typed, limited to LLM-supported constructs, and designed for streaming.
- **Streaming JSON parser**: Hashbrown’s incremental JSON parser that uses Skillet schemas to parse partial model output as it streams, enabling low-latency structured data and UI rendering.
- **Tools (tool calling)**: Async functions you expose to the model with a name, description, optional schema for arguments, and a handler. The model can call tools to read app state or perform actions.
- **Structured output**: Model responses constrained by a Skillet schema; Hashbrown parses the response into typed JSON you can consume directly.
- **Streaming**: Hashbrown processes model output as it arrives; Skillet supports streaming strings, arrays, and objects to power real-time UI updates.

## Test Style Example
Use top-level `test(...)` with arrange/act/assert separated by blank lines.

```ts
test('does the thing', () => {
  const input = buildInput();
  const subject = createSubject();

  const result = subject.run(input);

  expect(result).toEqual({ ok: true });
});
```
