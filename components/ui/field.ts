// Class names for native form fields, so every input and select in the app looks the same.
// (Native elements rather than components: they're used straight in forms and toolbars.)

const base =
  "rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

/** Full-width input (or select in a settings form). */
export const inputCls = `flex h-9 w-full px-3 py-1 text-sm ${base}`

/** Multi-line input. */
export const textareaCls = `w-full px-3 py-2 text-sm ${base}`

/** A select in a toolbar: as wide as its options. */
export const selectCls = `h-9 px-2 text-sm ${base}`

/** A small select, in a section header or a popup's settings. */
export const selectSmCls = `h-8 px-2 text-xs ${base}`
