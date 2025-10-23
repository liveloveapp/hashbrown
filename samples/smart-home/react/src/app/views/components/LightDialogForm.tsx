import { useCompletion } from '@hashbrownai/react';
import { useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Light as LightModel } from '../../models/light.model';
import { Button } from '../../shared/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../shared/dialog';
import { Input } from '../../shared/input';
import { Label } from '../../shared/label';
import { useSmartHomeStore } from '../../store/smart-home.store';
import { CircleAlert } from 'lucide-react';

interface LightDialogFormProps {
  light?: LightModel;
}

export const LightDialogForm = (
  props: LightDialogFormProps & {
    children: React.ReactNode;
  },
) => {
  const { light, children } = props;
  const addLight = useSmartHomeStore((state) => state.addLight);
  const updateLight = useSmartHomeStore((state) => state.updateLight);
  const lights = useSmartHomeStore((state) => state.lights);
  const inputRef = useRef<HTMLInputElement>(null);

  const [lightName, setLightName] = useState(light?.name || '');
  const [open, setOpen] = useState(false);

  const { output: nameCompletion, exhaustedRetries } = useCompletion({
    model: 'gpt-4o-mini',
    input: open ? lightName : '',
    system: `
      Help the user generate a name for a light. The input will be what
      they have typed so far, and the output should be a prediction for
      the name of the light. Just give me the next bit of text to add to
      the name. Don't include any other text.
      
      If the name looks complete or sounds like a good name, just return
      an empty string.

      Never include quote marks around your prediction.

      Put a leading space if necessary.
      
      The user already has these lights in their home:
      ${lights.map((l) => l.name).join(', ')}
    `,
    retries: 3,
  });

  const handleSubmit = () => {
    if (light) {
      updateLight(light.id, {
        name: lightName,
      });
    } else {
      addLight({
        id: uuidv4(),
        name: lightName,
        brightness: 100,
      });
    }
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && nameCompletion) {
      e.preventDefault();
      const updated = lightName + nameCompletion;
      setLightName(updated);
      // Reposition cursor at end and maintain focus
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(updated.length, updated.length);
        }
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{light ? 'Edit' : 'Add'} Light</DialogTitle>
          <DialogDescription>
            {light
              ? 'Edit your light settings.'
              : 'Add a new light to your system.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="light-name" className="sr-only">
              Light Name
            </Label>
            <div className="relative">
              <Input
                ref={inputRef}
                id="light-name"
                placeholder="Light Name"
                value={lightName}
                onChange={(e) => setLightName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-transparent"
              />
              {nameCompletion && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="px-3 py-1">
                    <span className="invisible">{lightName}</span>
                    <span className="text-sm text-gray-400 italic">
                      {nameCompletion}
                    </span>
                  </div>
                </div>
              )}

              {exhaustedRetries && (
                <div className="mt-3 flex gap-2 bg-destructive/80 rounded-md p-2 text-primary-foreground">
                  <CircleAlert />
                  Completion is not available at this time.
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button type="submit" onClick={handleSubmit}>
            {light ? 'Save' : 'Add'}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
