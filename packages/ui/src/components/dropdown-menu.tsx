import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import * as React from "react";
import { cn } from "../lib/utils";

export type DropdownMenuProps = React.ComponentProps<typeof MenuPrimitive.Root>;

export function DropdownMenu(props: DropdownMenuProps) {
  return <MenuPrimitive.Root {...props} />;
}

type TriggerProps = Omit<React.ComponentProps<typeof MenuPrimitive.Trigger>, "render"> & {
  children: React.ReactElement;
};

export function DropdownMenuTrigger({ children, className, ...props }: TriggerProps) {
  const childClassName = React.isValidElement<{ className?: string }>(children)
    ? children.props.className
    : undefined;

  return (
    <MenuPrimitive.Trigger
      {...props}
      data-slot="dropdown-menu-trigger"
      render={children}
      className={cn(childClassName, className)}
    />
  );
}

export type DropdownMenuContentProps = React.ComponentProps<typeof MenuPrimitive.Popup> & {
  portalProps?: React.ComponentProps<typeof MenuPrimitive.Portal>;
  positionerProps?: Omit<React.ComponentProps<typeof MenuPrimitive.Positioner>, "children">;
};

export function DropdownMenuContent({
  children,
  className,
  portalProps,
  positionerProps,
  ...props
}: DropdownMenuContentProps) {
  return (
    <MenuPrimitive.Portal {...portalProps}>
      <MenuPrimitive.Positioner
        side="bottom"
        align="end"
        sideOffset={8}
        {...positionerProps}
        className={cn("z-50", positionerProps?.className)}
      >
        <MenuPrimitive.Popup
          {...props}
          data-slot="dropdown-menu-content"
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

export type DropdownMenuItemProps = React.ComponentProps<typeof MenuPrimitive.Item>;

export function DropdownMenuItem({ children, className, ...props }: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      {...props}
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
    >
      {children}
    </MenuPrimitive.Item>
  );
}
