import * as React from "react";
import { cn } from "../lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          className={cn(
            "absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95",
            className,
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
