import { Menu as MenuPrimitive } from "@base-ui-components/react/menu";
import * as React from "react";
import { cn } from "../lib/utils";

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  return <MenuPrimitive.Root>{children}</MenuPrimitive.Root>;
}

export function DropdownMenuTrigger({
  children,
  className,
}: {
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  className?: string;
}) {
  return (
    <MenuPrimitive.Trigger
      render={children as React.ReactElement<Record<string, unknown>>}
      className={cn(children.props.className, className)}
    />
  );
}

export function DropdownMenuContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
        <MenuPrimitive.Popup
          className={cn(
            "w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
            className,
          )}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <MenuPrimitive.Item
      onClick={onClick}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
    >
      {children}
    </MenuPrimitive.Item>
  );
}
