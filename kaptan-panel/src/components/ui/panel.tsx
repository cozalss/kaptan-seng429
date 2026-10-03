import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Panel: a brighter sheet laid on the paper with a 1.5px ink border. `raised` adds the
 * hard offset shadow — use it for the one thing on a screen that must be acted on
 * (an approval card, the kill switch), not for every box.
 */
export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "div" | "article" | "aside";
  raised?: boolean;
  tone?: "panel" | "paper" | "critical";
}

export function Panel({ as: Tag = "section", raised = false, tone = "panel", className, ...props }: PanelProps) {
  return (
    <Tag
      className={cn(
        "relative border-[1.5px] border-ink",
        tone === "panel" && "bg-panel",
        tone === "paper" && "bg-paper",
        tone === "critical" && "border-north bg-panel",
        raised && "shadow-ink-lg",
        className,
      )}
      {...props}
    />
  );
}

export interface PanelHeaderProps {
  title: ReactNode;
  /** One line of context under the title (Inter 12, muted). */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Small code or index shown left of the title (e.g. "R07", "§3"). */
  code?: ReactNode;
  id?: string;
  className?: string;
}

export function PanelHeader({ title, meta, actions, code, id, className }: PanelHeaderProps) {
  return (
    <header className={cn("flex items-start gap-3 border-b border-hairline px-4 py-3", className)}>
      {code ? <span className="code mt-0.5 text-muted">{code}</span> : null}
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-[15px] font-medium leading-5 text-ink">
          {title}
        </h2>
        {meta ? <p className="mt-0.5 text-meta text-muted">{meta}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function PanelFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 border-t border-hairline px-4 py-3", className)} {...props} />;
}
