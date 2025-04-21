// Uncomment this line to use CSS modules
// import styles from './app.module.css';
import { ChatProvider, createTool } from '@hashbrownai/react';
import { Link, Route, Routes } from 'react-router-dom';
import { StoreInitializer } from './components/StoreInitializer';
import { ChatPanel } from './shared/ChatPanel';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from './shared/navigation-menu';
import { Toaster } from './shared/toaster';
import { useToast } from './shared/use-toast';
import { useSmartHomeStore } from './store/smart-home.store';
import { LightsView } from './views/LightsView';
import { ScenesView } from './views/ScenesView';
import { ScheduledScenesView } from './views/ScheduledScenesView';

export function App() {
  const { toast } = useToast();
  const lights = useSmartHomeStore((state) => state.lights);
  const scenes = useSmartHomeStore((state) => state.scenes);
  const scheduledScenes = useSmartHomeStore((state) => state.scheduledScenes);

  return (
    <ChatProvider
      // model='gemini-2.5-pro-exp-03-25'
      model="o4-mini"
      temperature={1}
      tools={[
        createTool({
          name: 'getLights',
          description: 'Get the current lights',
          handler: () => Promise.resolve(lights),
        }),
      ]}
      maxTokens={1000}
    >
      <StoreInitializer />
      <div className="flex justify-between py-2 items-center border-b">
        <p className="text-xl font-bold p-2">Smart Home</p>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link to="/lights" className={navigationMenuTriggerStyle()}>
                  Lights
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link to="/scenes" className={navigationMenuTriggerStyle()}>
                  Scenes
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link
                  to="/scheduled-scenes"
                  className={navigationMenuTriggerStyle()}
                >
                  Scheduled Scenes
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-3">
          <div className="p-2">
            <Routes>
              <Route path="/lights" element={<LightsView lights={lights} />} />
              <Route path="/scenes" element={<ScenesView scenes={scenes} />} />
              <Route
                path="/scheduled-scenes"
                element={
                  <ScheduledScenesView scheduledScenes={scheduledScenes} />
                }
              />
              <Route path="/" element={<p>Home</p>} />
            </Routes>
          </div>
          {/* END: routes */}
        </div>
        <div className="col-span-1 border-l p-2">
          <ChatPanel />
        </div>
      </div>
      <Toaster />
    </ChatProvider>
  );
}

export default App;
