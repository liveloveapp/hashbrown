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

export const AddLightDialogForm = () => {
  return (
    <Dialog>
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
            <Input id="link" placeholder="Light Name" />
          </div>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button type="submit">Add</Button>
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
