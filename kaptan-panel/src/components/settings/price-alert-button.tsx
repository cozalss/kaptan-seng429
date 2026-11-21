"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { PriceAlertForm } from "./price-alert-form";

/**
 * "Fiyat uyarısı" on a company page: opens the small form for this share. The list of every alert, and removing
 * one, is in Ayarlar · Fiyat uyarıları (the confirmation says so).
 */
export function PriceAlertButton({
  ticker,
  name,
}: {
  ticker: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && setMade(false))}>
      <DialogTrigger asChild>
        <Button variant="secondary">Fiyat uyarısı</Button>
      </DialogTrigger>
      <DialogContent
        size="md"
        title={`${name} için fiyat uyarısı`}
        description="Hisse istediğin fiyata gelince haber veririm. Fiyatlar yaklaşık 15 dakika gecikmelidir."
      >
        {made ? (
          <div className="grid gap-3">
            <p role="status" className="text-body text-ink">
              Uyarı kuruldu. Tüm uyarılarını Ayarlar’da görür ve kaldırırsın.
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setOpen(false)}>
                Tamam
              </Button>
            </div>
          </div>
        ) : (
          <PriceAlertForm ticker={ticker} onMade={() => setMade(true)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
