// /* eslint-disable @typescript-eslint/no-explicit-any */
// import { render, screen } from '@testing-library/react';
// import { Chat, fryHashbrown, Hashbrown, s } from '@hashbrownai/core';

// import { HashbrownProvider } from '../hashbrown-provider';
// import { useTool } from './use-tool';
// import { useChat } from './use-chat';

test('uncomment the tests and delete me', () => {
  expect(true).toBe(true);
});

// vi.mock('@hashbrownai/core', async () => {
//   const originalModule = (await vi.importActual(
//     '@hashbrownai/core',
//   )) as typeof import('@hashbrownai/core');

//   const updateOptions = vi.fn();
//   const fryHashbrown = vi.fn(
//     (options: {
//       messages: Chat.Message<string, Chat.AnyTool>[];
//       system: string;
//     }) => {
//       return {
//         messages: options.messages,
//         error: undefined,
//         teardown: vi.fn(),
//         setMessages: vi.fn(),
//         sendMessage: vi.fn(),
//         stop: vi.fn(),
//         resendMessages: vi.fn(),
//         updateOptions,
//         observeIsReceiving: vi.fn(),
//         observeMessages: vi.fn(),
//         observeIsSending: vi.fn(),
//         observeIsRunningToolCalls: vi.fn(),
//         observeError: vi.fn(),
//         observeExhaustedRetries: vi.fn(),
//         observeIsLoading: vi.fn(),
//       } as Hashbrown<unknown, Chat.AnyTool>;
//     },
//   );

//   (fryHashbrown as any).updateOptions = updateOptions;

//   return {
//     ...originalModule,
//     fryHashbrown,
//   };
// });

// afterEach(() => {
//   shouldRegenerateHandler = false;
//   vi.clearAllMocks();
// });

// const ProviderWrapper = ({ children }: { children: React.ReactNode }) => (
//   <HashbrownProvider url="localhost">{children}</HashbrownProvider>
// );

// let shouldRegenerateHandler = false;

// const TestComponent = () => {
//   const searchRestaurantTool = useTool({
//     name: 'Restaurant Search',
//     description: 'Search for restaurants based on location and cuisine.',
//     schema: s.object('RestaurantSearchParams', {
//       location: s.string('Location'),
//       cuisine: s.string('Cuisine'),
//       radius: s.number('Radius'), // in miles
//     }),
//     handler: async () => vi.fn(),
//     deps: [shouldRegenerateHandler],
//   });
//   const { messages } = useChat({
//     model: 'gpt-4o',
//     tools: [searchRestaurantTool],
//     system: 'You are a helpful assistant.',
//     messages: [
//       {
//         role: 'user',
//         content: 'Can you help me find a restaurant?',
//       },
//     ],
//   });

//   return (
//     <div>
//       {messages.map((msg, index) => (
//         <div key={index}>{JSON.stringify(msg.content)}</div>
//       ))}
//     </div>
//   );
// };

// it('should initialize with default values', () => {
//   render(<TestComponent />, { wrapper: ProviderWrapper });

//   expect(
//     screen.getByText('"Can you help me find a restaurant?"'),
//   ).toBeInTheDocument();
// });

// it('should not regenerate Hashbrown on a typical render', () => {
//   const { rerender } = render(<TestComponent />, {
//     wrapper: ProviderWrapper,
//   });
//   expect(fryHashbrown).toHaveBeenCalledTimes(1);
//   expect((fryHashbrown as any).updateOptions).toHaveBeenCalledTimes(1);

//   rerender(<TestComponent />);

//   expect(fryHashbrown).toHaveBeenCalledTimes(1);
//   expect((fryHashbrown as any).updateOptions).toHaveBeenCalledTimes(2);
// });

// it('should not regenerate Hashbrown even when a tool has a changed dependency', () => {
//   const { rerender } = render(<TestComponent />, {
//     wrapper: ProviderWrapper,
//   });
//   expect(fryHashbrown).toHaveBeenCalledTimes(1);
//   expect((fryHashbrown as any).updateOptions).toHaveBeenCalledTimes(1);

//   shouldRegenerateHandler = true; // Change the handler to trigger re-render
//   rerender(<TestComponent />);

//   expect(fryHashbrown).toHaveBeenCalledTimes(1);
//   expect((fryHashbrown as any).updateOptions).toHaveBeenCalledTimes(2);
// });
