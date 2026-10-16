import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as React from "react";
import { cn } from "../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipPortal = TooltipPrimitive.Portal;
export const TooltipPositioner = TooltipPrimitive.Positioner;
export const TooltipPopup = TooltipPrimitive.Popup;
export const TooltipArrow = TooltipPrimitive.Arrow;

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
  portalProps?: React.ComponentProps<typeof TooltipPrimitive.Portal>;
  side?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["side"];
  sideOffset?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["sideOffset"];
};

/** Compatibility wrapper for the original content-and-child tooltip API. */
export function Tooltip({
  content,
  children,
  className,
  portalProps,
  side = "top",
  sideOffset = 8,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={children} />
        <TooltipPrimitive.Portal {...portalProps}>
          <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset}>
            <TooltipPrimitive.Popup
              data-slot="tooltip-content"
              className={cn(
                "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95",
                className,
              )}
            >
              {content}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
