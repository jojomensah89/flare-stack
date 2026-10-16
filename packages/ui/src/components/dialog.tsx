import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils";

export type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;

export function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root {...props} />;
}

type TriggerProps = Omit<React.ComponentProps<typeof DialogPrimitive.Trigger>, "render"> & {
  children: React.ReactElement;
};

export function DialogTrigger({ children, className, ...props }: TriggerProps) {
  const childClassName = React.isValidElement<{ className?: string }>(children)
    ? children.props.className
    : undefined;

  return (
    <DialogPrimitive.Trigger
      {...props}
      data-slot="dialog-trigger"
      render={children}
      className={cn(childClassName, className)}
    />
  );
}

export type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Popup> & {
  backdropClassName?: string;
  portalProps?: React.ComponentProps<typeof DialogPrimitive.Portal>;
};

export function DialogContent({
  children,
  className,
  backdropClassName,
  portalProps,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal {...portalProps}>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className={cn(
          "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm animate-in fade-in-0",
          backdropClassName,
        )}
      />
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        <DialogPrimitive.Popup
          {...props}
          data-slot="dialog-content"
          className={cn(
            "relative z-50 grid w-full max-w-lg gap-4 border border-border bg-background p-6 shadow-lg duration-200 sm:rounded-lg animate-in zoom-in-95",
            className,
          )}
        >
          {children}
          <DialogPrimitive.Close
            aria-label="Close dialog"
            data-slot="dialog-close"
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

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
      {...props}
    />
  );
}

export type DialogTitleProps = React.ComponentProps<typeof DialogPrimitive.Title>;

export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export type DialogDescriptionProps = React.ComponentProps<typeof DialogPrimitive.Description>;

export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
