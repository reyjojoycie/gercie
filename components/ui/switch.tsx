// components/ui/switch.tsx
'use client';

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
  checked?: boolean;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, checked, disabled, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (onCheckedChange) {
        onCheckedChange(event.target.checked);
      }
      if (props.onChange) {
        props.onChange(event);
      }
    };

    return (
      <label
        className={cn(
          "relative inline-flex cursor-pointer items-center",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          ref={ref}
          {...props}
        />
        <div
          className={cn(
            "h-6 w-11 rounded-full bg-neutral-300 transition-colors",
            "peer-checked:bg-gold-500",
            "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500 peer-focus-visible:ring-offset-2",
            "dark:bg-neutral-700"
          )}
        >
          <div
            className={cn(
              "absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform",
              "peer-checked:translate-x-5"
            )}
          />
        </div>
      </label>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };