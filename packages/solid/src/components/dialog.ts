/** Headless Base UI-shaped Dialog over a full-window GPUIX anchored layer. */

import {
  createComponent,
  createContext,
  createSignal,
  onCleanup,
  Show,
  useContext,
  type JSX,
} from "solid-js"
import type { EventPayload } from "@gpuix/native"
import type { HostProps, KeyEvent } from "@gpuix/native/host"
import type { HostElement } from "../host.js"
import { jsx } from "../jsx-runtime.js"
import { createWindowSize } from "../primitives.js"
import { useGpuixRequired } from "../root.js"
import { renderSlot, useDismissLayer } from "./floating.js"

interface DialogState {
  open(): boolean
  modal(): boolean
  setOpen(open: boolean): void
  pointerDismissal(): boolean
  trigger: { current: HostElement | null }
  /** Focused element when the dialog opened, for a dialog without a trigger. */
  returnFocus: { current: number | null }
}

const DialogContext = createContext<DialogState>()
function context(name: string): DialogState {
  const value = useContext(DialogContext)
  if (!value) throw new Error(`${name} must be used inside Dialog`)
  return value
}

/** Enter and Space activate a focused part, like a `<button>`. */
function isActivationKey(event: KeyEvent): boolean {
  return event.key === "enter" || event.key === "space"
}

export interface DialogProps {
  children?: JSX.Element
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Default true: blocks the page behind, keeps Tab inside the popup. */
  modal?: boolean
  /** Keep the dialog open when the backdrop is pressed. */
  disablePointerDismissal?: boolean
}

export function Dialog(props: DialogProps): JSX.Element {
  const renderer = useGpuixRequired()
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false)
  const open = () => props.open === undefined ? internalOpen() : props.open
  const state: DialogState = {
    open,
    modal: () => props.modal ?? true,
    pointerDismissal: () => !props.disablePointerDismissal,
    trigger: { current: null },
    returnFocus: { current: null },
    setOpen(next) {
      const previous = open()
      if (previous === next) return
      if (next) state.returnFocus.current = renderer.getFocusedElementId?.() ?? null
      if (props.open === undefined) setInternalOpen(next)
      props.onOpenChange?.(next)
    },
  }
  return createComponent(DialogContext.Provider, {
    value: state,
    get children() { return props.children },
  })
}

export interface DialogTriggerProps extends HostProps {
  children?: JSX.Element
  asChild?: boolean
  ref?: (element: HostElement) => void
}

export function DialogTrigger(props: DialogTriggerProps): JSX.Element {
  const state = context("DialogTrigger")
  return renderSlot({
    asChild: props.asChild,
    children: props.children,
    props: {
      ...props,
      ref(element: HostElement) {
        state.trigger.current = element
        props.ref?.(element)
      },
      get "aria-expanded"() { return state.open() },
      onClick(event: EventPayload) {
        props.onClick?.(event)
        state.setOpen(true)
      },
      onKeyDown(event: KeyEvent) {
        props.onKeyDown?.(event)
        if (isActivationKey(event)) state.setOpen(true)
      },
    },
    defaultTabIndex: 0,
  })
}

export interface DialogPortalProps extends HostProps {
  children?: JSX.Element
}

/**
 * A full-window layer painted after the page, so it covers `<virtual-list>`
 * and everything else. Mounted only while the dialog is open.
 */
export function DialogPortal(props: DialogPortalProps): JSX.Element {
  const state = context("DialogPortal")
  return createComponent(Show, {
    get when() { return state.open() },
    keyed: true,
    get children() {
      const size = createWindowSize()
      return jsx("anchored", {
        ...props,
        position: { x: 0, y: 0 },
        anchor: "topLeft",
        fit: "switch",
        deferred: true,
        // Below menus and tooltips (priority 1), so a Select inside the popup
        // opens on top of it.
        priority: 0,
        get occlude() { return state.modal() },
        get style() {
          return {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: size().width,
            height: size().height,
            // Explicit transparent: the Backdrop paints the dim, not the layer.
            backgroundColor: "transparent",
            ...props.style,
            pointerEvents: state.modal() ? props.style?.pointerEvents : "none",
          }
        },
        get children() { return props.children },
      })
    },
  })
}

export interface DialogBackdropProps extends HostProps {
  children?: JSX.Element
}

/** Covers the window behind the popup. A press on it closes the dialog. */
export function DialogBackdrop(props: DialogBackdropProps): JSX.Element {
  const state = context("DialogBackdrop")
  return jsx("div", {
    ...props,
    get style() {
      return { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, ...props.style }
    },
    onMouseDown(event: EventPayload) {
      props.onMouseDown?.(event)
      if (state.pointerDismissal()) state.setOpen(false)
    },
  })
}

export interface DialogPopupProps extends HostProps {
  children?: JSX.Element
  ref?: (element: HostElement) => void
}

/**
 * The dialog surface. Focuses itself on open, so the first Tab enters it, and
 * gives focus back to the trigger (or the element focused before) on close.
 * Pass `autoFocus={false}` and put `autoFocus` on a child to focus that instead.
 */
export function DialogPopup(props: DialogPopupProps): JSX.Element {
  const state = context("DialogPopup")
  const renderer = useGpuixRequired()
  let popup: HostElement | null = null
  return createComponent(Show, {
    get when() { return state.open() },
    keyed: true,
    get children() {
      useDismissLayer(() => state.setOpen(false))
      onCleanup(() => {
        const target = state.trigger.current?.id ?? state.returnFocus.current
        if (target != null) renderer.focusElement?.(target)
      })
      return jsx("div", {
        ...props,
        ref(element: HostElement) {
          popup = element
          props.ref?.(element)
        },
        get role() { return props.role ?? "dialog" },
        get autoFocus() { return props.autoFocus ?? true },
        get tabIndex() { return props.tabIndex ?? -1 },
        // A press inside the popup must never reach the backdrop behind it.
        get style() { return { pointerEvents: "auto", ...props.style } },
        onKeyDown(event: KeyEvent) {
          props.onKeyDown?.(event)
          if (!state.modal() || event.key !== "tab" || event.defaultPrevented || !popup) return
          event.preventDefault()
          if (event.modifiers?.shift) renderer.focusPreviousWithin?.(popup.id)
          else renderer.focusNextWithin?.(popup.id)
        },
      })
    },
  })
}

export function DialogTitle(props: HostProps & { children?: JSX.Element }): JSX.Element {
  return jsx("div", { role: "heading", "aria-level": 2, ...props })
}

export function DialogDescription(props: HostProps & { children?: JSX.Element }): JSX.Element {
  return jsx("div", props as Record<string, unknown>)
}

export interface DialogCloseProps extends HostProps {
  children?: JSX.Element
  asChild?: boolean
}

export function DialogClose(props: DialogCloseProps): JSX.Element {
  const state = context("DialogClose")
  return renderSlot({
    asChild: props.asChild,
    children: props.children,
    props: {
      ...props,
      onClick(event: EventPayload) {
        props.onClick?.(event)
        state.setOpen(false)
      },
      onKeyDown(event: KeyEvent) {
        props.onKeyDown?.(event)
        if (isActivationKey(event)) state.setOpen(false)
      },
    },
    defaultTabIndex: 0,
  })
}

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
