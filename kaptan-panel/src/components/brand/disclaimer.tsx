import { cn } from "@/lib/utils";

/** The exact disclaimer required on every screen (09 §10.1, NFR-20). Do not paraphrase. */
export const DISCLAIMER_TR =
  "KAPtan bir ders projesidir. Üretilen sınıflandırmalar, özetler ve emir fişleri yatırım tavsiyesi değildir; sermaye piyasası mevzuatı kapsamında yatırım danışmanlığı hizmeti sunulmamaktadır. Özetler otomatik üretilmiştir ve hata içerebilir.";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-hairline pt-4 pb-6 text-meta leading-[18px] text-muted", className)}>
      <p className="max-w-[920px]">{DISCLAIMER_TR}</p>
      <p className="mt-1.5">
        SENG 429 · Çankaya Üniversitesi · Güz 2026 · Sanal para (SimBIST paper) · Şirket adları kurgusaldır (Temsili).
      </p>
    </footer>
  );
}
