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
import { LightsView } from './views/LightsView';
import { ScenesView } from './views/ScenesView';
import { ScheduledScenesView } from './views/ScheduledScenesView';

export function App() {
  const url = 'http://localhost:3000/api/chat';

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
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          <div className="gap-4">
            <div className="col-span-3">
              <div className="p-2">
                <Routes>
                  <Route path="/lights" element={<LightsView />} />
                  <Route path="/scenes" element={<ScenesView />} />
                  <Route
                    path="/scheduled-scenes"
                    element={<ScheduledScenesView />}
                  />
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
