import { Dialog as DialogPrimitive } from "@base-ui-components/react/dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export function DialogTrigger({
  children,
  className,
}: {
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  className?: string;
}) {
  return (
    <DialogPrimitive.Trigger
      render={children as React.ReactElement<Record<string, unknown>>}
      className={cn(children.props.className, className)}
    />
  );
}

export function DialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm animate-in fade-in-0" />
      <DialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-center justify-center">
        <DialogPrimitive.Popup
          className={cn(
            "relative z-50 grid w-full max-w-lg gap-4 border border-border bg-background p-6 shadow-lg duration-200 sm:rounded-lg animate-in zoom-in-95",
            className,
          )}
        >
          {children}
          <DialogPrimitive.Close
            aria-label="Close dialog"
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
