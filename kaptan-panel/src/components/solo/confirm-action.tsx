"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";

/** A question with a trigger, a cancel and one confirming button (used by Ayarlar and the home). */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirm,
  busy,
  tone,
  pending,
  error,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirm: string;
  busy: string;
  tone: "default" | "critical";
  pending: boolean;
  error: string | null;
  onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm" tone={tone} title={title} description={description}>
        {error ? (
          <p role="alert" className="mb-3 text-dense font-medium text-north">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Vazgeç
          </Button>
          <Button
            variant={tone === "critical" ? "danger" : "primary"}
            pending={pending}
            disabled={pending}
            onClick={async () => {
              if (await onConfirm()) setOpen(false);
            }}
          >
            {pending ? busy : confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
