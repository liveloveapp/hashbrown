import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
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

export const AddLightDialogForm = () => {
  const addLight = useSmartHomeStore((state) => state.addLight);

  const [lightName, setLightName] = useState('');
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    addLight({
      id: uuidv4(),
      name: lightName,
      brightness: 100,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add Light</Button>
      </DialogTrigger>
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
