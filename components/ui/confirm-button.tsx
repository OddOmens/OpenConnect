"use client"

import * as React from "react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * A button that asks before it acts, in place: the first click turns it into "Confirm / Cancel".
 * Used instead of window.confirm(), which a browser can silently block (the click then does
 * nothing at all).
 */
export function ConfirmButton({ question, confirmLabel = "Confirm", onConfirm, destructive, children, className, ...props }: Omit<ButtonProps, "onClick"> & {
  question: string
  confirmLabel?: string
  onConfirm: () => void
  destructive?: boolean
}) {
  const [asking, setAsking] = React.useState(false)
  // Left alone, the question goes away again.
  React.useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => setAsking(false), 8000)
    return () => clearTimeout(t)
  }, [asking])

  if (!asking) {
    return (
      <Button {...props} className={className} onClick={() => setAsking(true)}>
        {children}
      </Button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2" role="group" aria-label={question}>
      <span className="text-xs text-muted-foreground">{question}</span>
      <Button
        size={props.size}
        variant={destructive ? "destructive" : "default"}
        autoFocus
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
      <Button size={props.size} variant="ghost" className={cn(props.size === "sm" && "px-2")} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  )
}
