"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Density comes from the nearest [data-density] (see DataTable). The header
// sticks within the container, so give it a max height (containerClassName)
// when the table can be long.
//
// stackOnMobile: below 768px each row becomes a card and each cell shows its
// column name from the `label` prop on TableCell.
function Table({
  className,
  containerClassName,
  stackOnMobile = false,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string; stackOnMobile?: boolean }) {
  return (
    <div
      data-slot="table-container"
      data-stack={stackOnMobile || undefined}
      className={cn(
        "relative w-full overflow-auto",
        stackOnMobile &&
          "max-md:max-h-none max-md:[&_thead]:sr-only max-md:[&_table]:block max-md:[&_tbody]:block max-md:[&_tr]:block max-md:[&_tr]:px-4 max-md:[&_tr]:py-3 max-md:[&_td]:flex max-md:[&_td]:h-auto max-md:[&_td]:items-center max-md:[&_td]:justify-between max-md:[&_td]:gap-4 max-md:[&_td]:px-0 max-md:[&_td]:py-1 max-md:[&_td]:text-right max-md:[&_td]:whitespace-normal max-md:[&_td[data-label]]:before:text-left max-md:[&_td[data-label]]:before:text-[12px] max-md:[&_td[data-label]]:before:text-ink-muted max-md:[&_td[data-label]]:before:content-[attr(data-label)]",
        containerClassName,
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-[length:var(--kc-cell-font)]", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("sticky top-0 z-10 glass [&_tr]:border-b [&_tr]:border-hairline [&_tr]:hover:bg-transparent", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-surface-raised font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-hairline transition-colors duration-fast ease-standard hover:bg-surface-raised/60 has-aria-expanded:bg-surface-raised data-[state=selected]:bg-surface-raised",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-[var(--kc-row-height)] px-[var(--kc-cell-x)] text-left align-middle text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap text-ink-muted [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, label, ...props }: React.ComponentProps<"td"> & { label?: string }) {
  return (
    <td
      data-slot="table-cell"
      data-label={label}
      className={cn(
        "h-[var(--kc-row-height)] px-[var(--kc-cell-x)] py-[var(--kc-cell-y)] align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
