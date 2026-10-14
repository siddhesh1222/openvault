import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Small dialog with one text field, used for "New folder" and "Rename".
 * When renaming a file, only the part before the extension is pre-selected.
 */
export function NameDialog({ open, onOpenChange, title, description, label = "Name", initialValue = "", submitLabel, onSubmit }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* The form is only mounted while the dialog is open, so its state
            starts fresh (from initialValue) every time it opens. */}
        <NameForm
          title={title}
          description={description}
          label={label}
          initialValue={initialValue}
          submitLabel={submitLabel}
          onSubmit={onSubmit}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NameForm({ title, description, label, initialValue, submitLabel, onSubmit, onClose }) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  // Select "report" in "report.pdf" so typing replaces the name but keeps the extension.
  function selectName(e) {
    const dot = initialValue.lastIndexOf(".");
    e.target.setSelectionRange(0, dot > 0 ? dot : initialValue.length);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onSubmit(name);
      onClose();
    } catch {
      // the caller already showed a toast; keep the dialog open to fix the name
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="item-name">{label}</Label>
        <Input id="item-name" value={value} onChange={(e) => setValue(e.target.value)} onFocus={selectName} autoFocus maxLength={255} className="h-10" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !value.trim() || value.trim() === initialValue}>
          {busy && <LoaderCircle className="animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
