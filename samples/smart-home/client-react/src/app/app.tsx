// Uncomment this line to use CSS modules
// import styles from './app.module.css';
import { HashbrownProvider } from '@hashbrownai/react';
import { Link, Route, Routes } from 'react-router-dom';
import { StoreInitializer } from './components/StoreInitializer';
//import { ChatPanel } from './shared/ChatPanel';
import { RichChatPanel } from './shared/RichChatPanel';
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
import { LiveTranslationView } from './views/LiveTranslationView';
import { ScenesView } from './views/ScenesView';
import { ScheduledScenesView } from './views/ScheduledScenesView';
import { UiCompletionView } from './views/UiCompletionView';

export function App() {
  const { toast } = useToast();
  const lights = useSmartHomeStore((state) => state.lights);
  const scenes = useSmartHomeStore((state) => state.scenes);
  const scheduledScenes = useSmartHomeStore((state) => state.scheduledScenes);

  const url = 'http://localhost:3000/chat';
  //const url = 'https://hashbrownai-dev.openai.azure.com/';

  return (
    <HashbrownProvider url={url}>
      <StoreInitializer />
      <div className="grid grid-cols-7">
        <div className="col-span-4">
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
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      to="/live-translation"
                      className={navigationMenuTriggerStyle()}
                    >
                      Live Translation
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      to="/ui-completion"
                      className={navigationMenuTriggerStyle()}
                    >
                      UI Completion
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          <div className="gap-4">
            <div className="col-span-3">
              <div className="p-2">
                <Routes>
                  <Route
                    path="/lights"
                    element={<LightsView lights={lights} />}
                  />
                  <Route
                    path="/scenes"
                    element={<ScenesView scenes={scenes} />}
                  />
                  <Route
                    path="/scheduled-scenes"
                    element={
                      <ScheduledScenesView scheduledScenes={scheduledScenes} />
                    }
                  />
                  <Route
                    path="/live-translation"
                    element={<LiveTranslationView />}
                  />
                  <Route path="/ui-completion" element={<UiCompletionView />} />
                  <Route path="/" element={<p>Home</p>} />
                </Routes>
              </div>
            </div>
          </div>
        </div>
        <div className="col-span-3 border-l p-2 h-screen overflow-hidden">
          {/* <ChatPanel /> */}
          <RichChatPanel />
        </div>
      </div>
      <Toaster />
    </HashbrownProvider>
  );
}

export default App;
