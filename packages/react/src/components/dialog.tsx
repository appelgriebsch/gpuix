/** Headless Base UI-shaped Dialog over a full-window GPUIX anchored layer. */

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
} from "react"
import type { ReactElement, ReactNode } from "react"
import type { EventPayload } from "@gpuix/native"
import type { KeyEvent, Props, PublicInstance } from "../types/host.js"
import { useGpuix } from "../hooks/use-gpuix.js"
import { useWindowSize } from "../hooks/use-window-size.js"
import {
  renderSlot,
  setRefs,
  useControllableState,
  useDismissLayer,
} from "./floating.js"

interface DialogContextValue {
  open: boolean
  modal: boolean
  disablePointerDismissal: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.MutableRefObject<PublicInstance | null>
  /** Focused element when the dialog opened, for a dialog without a trigger. */
  returnFocusRef: React.MutableRefObject<number | null>
}

const DialogContext = createContext<DialogContextValue | null>(null)

function useDialogContext(name: string): DialogContextValue {
  const context = useContext(DialogContext)
  if (!context) throw new Error(`${name} must be used inside Dialog`)
  return context
}

/** Enter and Space activate a focused part, like a `<button>`. */
function isActivationKey(event: KeyEvent): boolean {
  return event.key === "enter" || event.key === "space"
}

export interface DialogProps {
  children?: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Default true: blocks the page behind, keeps Tab inside the popup. */
  modal?: boolean
  /** Keep the dialog open when the backdrop is pressed. */
  disablePointerDismissal?: boolean
}

export function Dialog({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  modal = true,
  disablePointerDismissal = false,
}: DialogProps): ReactElement {
  const { renderer } = useGpuix()
  const [open, setOpenState] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })
  const triggerRef = useRef<PublicInstance | null>(null)
  const returnFocusRef = useRef<number | null>(null)
  const setOpen = (next: boolean) => {
    if (next && !open) returnFocusRef.current = renderer?.getFocusedElementId?.() ?? null
    setOpenState(next)
  }
  const context: DialogContextValue = {
    open,
    modal,
    disablePointerDismissal,
    setOpen,
    triggerRef,
    returnFocusRef,
  }
  return <DialogContext.Provider value={context}>{children}</DialogContext.Provider>
}

export interface DialogTriggerProps extends Props {
  asChild?: boolean
}

export const DialogTrigger = forwardRef<PublicInstance, DialogTriggerProps>(
  function DialogTrigger({ asChild, children, onClick, onKeyDown, ...props }, forwardedRef) {
    const context = useDialogContext("DialogTrigger")
    const { triggerRef } = context
    // Stable, so React does not detach it (set null) in the commit that
    // unmounts the popup, which is exactly when the popup reads it.
    const ref = useCallback((value: PublicInstance | null) => {
      triggerRef.current = value
      setRefs(value, forwardedRef)
    }, [triggerRef, forwardedRef])
    return renderSlot({
      asChild,
      children,
      props: {
        ...props,
        "aria-expanded": context.open,
        onClick: (event) => {
          onClick?.(event)
          context.setOpen(true)
        },
        onKeyDown: (event: KeyEvent) => {
          onKeyDown?.(event)
          if (isActivationKey(event)) context.setOpen(true)
        },
      },
      ref,
      defaultTabIndex: 0,
    })
  }
)

export interface DialogPortalProps extends Props {}

/**
 * A full-window layer painted after the page, so it covers `<virtual-list>`
 * and everything else. Mounted only while the dialog is open.
 */
export const DialogPortal = forwardRef<PublicInstance, DialogPortalProps>(
  function DialogPortal(props, ref) {
    const context = useDialogContext("DialogPortal")
    if (!context.open) return null
    return <DialogPortalSurface {...props} ref={ref} modal={context.modal} />
  }
)

const DialogPortalSurface = forwardRef<PublicInstance, DialogPortalProps & { modal: boolean }>(
  function DialogPortalSurface({ modal, style, children, ...props }, ref) {
    const size = useWindowSize()
    return (
      <anchored
        {...props}
        ref={ref}
        position={{ x: 0, y: 0 }}
        anchor="topLeft"
        fit="switch"
        deferred
        // Below menus and tooltips (priority 1), so a Select inside the popup
        // opens on top of it.
        priority={0}
        occlude={modal}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size.width,
          height: size.height,
          // Explicit transparent: the Backdrop paints the dim, not the layer.
          backgroundColor: "transparent",
          ...style,
          pointerEvents: modal ? style?.pointerEvents : "none",
        }}
      >
        {children}
      </anchored>
    )
  }
)

export interface DialogBackdropProps extends Props {}

/** Covers the window behind the popup. A press on it closes the dialog. */
export const DialogBackdrop = forwardRef<PublicInstance, DialogBackdropProps>(
  function DialogBackdrop({ style, onMouseDown, ...props }, ref) {
    const context = useDialogContext("DialogBackdrop")
    return (
      <div
        {...props}
        ref={ref}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, ...style }}
        onMouseDown={(event: EventPayload) => {
          onMouseDown?.(event)
          if (!context.disablePointerDismissal) context.setOpen(false)
        }}
      />
    )
  }
)

export interface DialogPopupProps extends Props {}

/**
 * The dialog surface. Focuses itself on open, so the first Tab enters it, and
 * gives focus back to the trigger (or the element focused before) on close.
 * Pass `autoFocus={false}` and put `autoFocus` on a child to focus that instead.
 */
export const DialogPopup = forwardRef<PublicInstance, DialogPopupProps>(
  function DialogPopup(
    { style, onKeyDown, autoFocus = true, tabIndex = -1, role = "dialog", ...props },
    forwardedRef
  ) {
    const context = useDialogContext("DialogPopup")
    const { renderer } = useGpuix()
    const popupRef = useRef<PublicInstance | null>(null)
    useDismissLayer(context.open, () => context.setOpen(false))
    const { triggerRef, returnFocusRef } = context
    useLayoutEffect(() => {
      if (!context.open || !renderer) return
      return () => {
        const target = triggerRef.current?.id ?? returnFocusRef.current
        if (target != null) renderer.focusElement?.(target)
      }
    }, [context.open, renderer, triggerRef, returnFocusRef])
    if (!context.open) return null
    return (
      <div
        {...props}
        ref={(value: PublicInstance | null) => {
          popupRef.current = value
          setRefs(value, forwardedRef)
        }}
        role={role}
        autoFocus={autoFocus}
        tabIndex={tabIndex}
        // A press inside the popup must never reach the backdrop behind it.
        style={{ pointerEvents: "auto", ...style }}
        onKeyDown={(event: KeyEvent) => {
          onKeyDown?.(event)
          if (!context.modal || event.key !== "tab" || event.defaultPrevented) return
          const popup = popupRef.current
          if (!popup) return
          event.preventDefault()
          if (event.modifiers?.shift) renderer?.focusPreviousWithin?.(popup.id)
          else renderer?.focusNextWithin?.(popup.id)
        }}
      />
    )
  }
)

export const DialogTitle = forwardRef<PublicInstance, Props>(function DialogTitle(props, ref) {
  return <div role="heading" aria-level={2} {...props} ref={ref} />
})

export const DialogDescription = forwardRef<PublicInstance, Props>(
  function DialogDescription(props, ref) {
    return <div {...props} ref={ref} />
  }
)

export interface DialogCloseProps extends Props {
  asChild?: boolean
}

export const DialogClose = forwardRef<PublicInstance, DialogCloseProps>(
  function DialogClose({ asChild, children, onClick, onKeyDown, ...props }, ref) {
    const context = useDialogContext("DialogClose")
    return renderSlot({
      asChild,
      children,
      props: {
        ...props,
        onClick: (event) => {
          onClick?.(event)
          context.setOpen(false)
        },
        onKeyDown: (event: KeyEvent) => {
          onKeyDown?.(event)
          if (isActivationKey(event)) context.setOpen(false)
        },
      },
      ref,
      defaultTabIndex: 0,
    })
  }
)

export {
  Dialog as Root,
  DialogBackdrop as Backdrop,
  DialogClose as Close,
  DialogDescription as Description,
  DialogPopup as Popup,
  DialogPortal as Portal,
  DialogTitle as Title,
  DialogTrigger as Trigger,
}
