import { useState } from 'react';
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

  const [lightName, setLightName] = useState(light?.name || '');
  const [open, setOpen] = useState(false);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Light</DialogTitle>
          <DialogDescription>Add a new light to your system.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="link" className="sr-only">
              Light Name
            </Label>
            <Input
              id="link"
              placeholder="Light Name"
              value={lightName}
              onChange={(e) => setLightName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button type="submit" onClick={handleSubmit}>
            Add
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
