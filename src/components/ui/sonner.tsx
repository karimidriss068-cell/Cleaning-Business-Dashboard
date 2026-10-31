"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      // Sits above the mobile tab bar (64px + safe area), bottom-right on desktop.
      mobileOffset={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--kc-success-soft)",
          "--success-text": "var(--kc-success-text)",
          "--success-border": "var(--kc-success-soft)",
          "--error-bg": "var(--kc-danger-soft)",
          "--error-text": "var(--kc-danger-text)",
          "--error-border": "var(--kc-danger-soft)",
          "--info-bg": "var(--kc-info-soft)",
          "--info-text": "var(--kc-accent-text)",
          "--info-border": "var(--kc-info-soft)",
          "--border-radius": "var(--kc-radius-sm)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast glass-popover !border-hairline",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
