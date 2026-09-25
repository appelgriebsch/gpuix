import type { EventPayload } from "../index.js"
import type {
  ElementIdAllocator,
  EventHandlerMap,
  HostEventHandler,
  KeyEvent,
  NativeRenderer,
  WindowEventHandler,
  WindowKeyEventHandler,
} from "./host.js"

export interface RendererRootHandlers {
  eventHandlers?: EventHandlerMap
  onWindowKeyDown?: WindowKeyEventHandler
  onWindowKeyUp?: WindowKeyEventHandler
  onSelectionChange?: WindowEventHandler
  /** See `WindowKeyEventHandlers.tabNavigation`. Defaults to true. */
  tabNavigation?: boolean
  onEvent?: (event: EventPayload) => void
  schedule?: (dispatch: () => void) => void
}

export interface RendererRootBinding {
  readonly ids: ElementIdAllocator
  readonly eventHandlers: EventHandlerMap
  readonly windowKeyEventId: number
  readonly windowSelectionEventId: number
  detach(): boolean
}

/**
 * One open overlay: a dialog, menu, popover or tooltip. The most recently
 * opened layer is on top, and only the top layer closes on Escape.
 */
export interface DismissLayer {
  /** Escape reached the window and no handler prevented it. */
  onEscapeKeyDown(event: KeyEvent): void
}

export interface RendererState {
  readonly ids: ElementIdAllocator
  attach(handlers?: RendererRootHandlers): RendererRootBinding
  dispatch(event: EventPayload): boolean
  current(): RendererRootBinding | undefined
  /** Open a layer. Call the returned function when it closes. */
  pushLayer(layer: DismissLayer): () => void
}

type ActiveRoot = RendererRootBinding & { handlers: RendererRootHandlers }

/** Shared by every event of one GPUI key dispatch. */
interface KeystrokeFlags {
  id: number | undefined
  prevented: boolean
  stopped: boolean
}

const STATE_KEY = Symbol.for("@gpuix/native/renderer-states")

/** Register an open overlay on this renderer's layer stack. */
export function pushDismissLayer(renderer: NativeRenderer, layer: DismissLayer): () => void {
  return createRendererState(renderer).pushLayer(layer)
}

function allStates(): WeakMap<NativeRenderer, RendererState> {
  const existing = Reflect.get(globalThis, STATE_KEY) as
    | WeakMap<NativeRenderer, RendererState>
    | undefined
  if (existing) return existing
  const states = new WeakMap<NativeRenderer, RendererState>()
  Reflect.set(globalThis, STATE_KEY, states)
  return states
}

function toKeyEvent(event: EventPayload, flags: KeystrokeFlags): KeyEvent {
  return {
    ...event,
    get defaultPrevented() {
      return flags.prevented
    },
    preventDefault() {
      flags.prevented = true
    },
    stopPropagation() {
      flags.stopped = true
    },
  }
}

function hasCommandModifier(event: KeyEvent): boolean {
  const modifiers = event.modifiers
  return Boolean(modifiers?.ctrl || modifiers?.alt || modifiers?.cmd)
}

export function createRendererState(renderer: NativeRenderer): RendererState {
  const existing = allStates().get(renderer)
  if (existing) return existing

  const ids = { nextElementId: 0 }
  let generation = 0
  let active: ActiveRoot | undefined
  const layers: DismissLayer[] = []
  // Native emits one keystroke's events back to back, in GPUI bubble order,
  // and the window event last. So only the latest keystroke needs flags.
  let keystroke: KeystrokeFlags = { id: undefined, prevented: false, stopped: false }
  const flagsFor = (event: EventPayload): KeystrokeFlags => {
    // A synthetic event without an id never shares flags with another event.
    if (event.keystrokeId == null) return { id: undefined, prevented: false, stopped: false }
    if (keystroke.id !== event.keystrokeId) {
      keystroke = { id: event.keystrokeId, prevented: false, stopped: false }
    }
    return keystroke
  }

  const state: RendererState = {
    ids,
    attach(handlers = {}) {
      if (active) {
        throw new Error(
          "This renderer already drives a mounted GPUIX root. One renderer owns one window, one native root id, and one event map, so a second root would silently take both over. Unmount the first root first."
        )
      }
      generation += 1
      const eventHandlers = handlers.eventHandlers ?? new Map()
      const binding: ActiveRoot = {
        ids,
        handlers,
        eventHandlers,
        windowKeyEventId: generation,
        windowSelectionEventId: generation,
        detach() {
          if (active !== binding) return false
          active = undefined
          return true
        },
      }
      active = binding
      return binding
    },
    dispatch(event) {
      const root = active
      if (!root) return false
      const schedule = (invoke: () => void) => {
        const run = () => {
          invoke()
          root.handlers.onEvent?.(event)
        }
        if (root.handlers.schedule) root.handlers.schedule(run)
        else run()
      }

      if (event.eventType === "windowKeyDown" || event.eventType === "windowKeyUp") {
        if (event.elementId !== root.windowKeyEventId) return false
        const keyDown = event.eventType === "windowKeyDown"
        const handler = keyDown ? root.handlers.onWindowKeyDown : root.handlers.onWindowKeyUp
        const flags = flagsFor(event)
        const keyEvent = toKeyEvent(
          { ...event, elementId: 0, eventType: keyDown ? "keyDown" : "keyUp" },
          flags
        )
        // Default actions run last, after every element handler and the window
        // handler of this keystroke had the chance to call preventDefault().
        const runDefault = () => {
          if (!keyDown || flags.prevented || hasCommandModifier(keyEvent)) return
          if (keyEvent.key === "escape") {
            layers.at(-1)?.onEscapeKeyDown(keyEvent)
          } else if (keyEvent.key === "tab" && root.handlers.tabNavigation !== false) {
            if (keyEvent.modifiers?.shift) renderer.focusPrevious?.()
            else renderer.focusNext?.()
          }
        }
        schedule(() => {
          if (handler && !flags.stopped) handler(keyEvent, renderer)
          runDefault()
        })
        return true
      }
      if (event.eventType === "selectionChange") {
        if (event.elementId !== root.windowSelectionEventId) return false
        const handler = root.handlers.onSelectionChange
        if (!handler) return false
        schedule(() => handler({ ...event, elementId: 0 }, renderer))
        return true
      }
      const handler: HostEventHandler | undefined =
        root.eventHandlers.get(event.elementId)?.get(event.eventType)
      if (!handler) return false
      if (event.eventType === "keyDown" || event.eventType === "keyUp") {
        const flags = flagsFor(event)
        const keyEvent = toKeyEvent(event, flags)
        schedule(() => {
          if (!flags.stopped) handler(keyEvent)
        })
        return true
      }
      schedule(() => handler(event))
      return true
    },
    current: () => active,
    pushLayer(layer) {
      layers.push(layer)
      return () => {
        const index = layers.indexOf(layer)
        if (index >= 0) layers.splice(index, 1)
      }
    },
  }
  allStates().set(renderer, state)
  return state
}

export function registerEventHandler(
  eventHandlers: EventHandlerMap,
  elementId: number,
  eventType: string,
  handler: HostEventHandler
): void {
  const handlers = eventHandlers.get(elementId) ?? new Map()
  handlers.set(eventType, handler)
  eventHandlers.set(elementId, handlers)
}

export function unregisterEventHandler(
  eventHandlers: EventHandlerMap,
  elementId: number,
  eventType: string
): void {
  const handlers = eventHandlers.get(elementId)
  if (!handlers) return
  handlers.delete(eventType)
  if (handlers.size === 0) eventHandlers.delete(elementId)
}

export function unregisterEventHandlers(
  eventHandlers: EventHandlerMap,
  elementId: number
): void {
  eventHandlers.delete(elementId)
}
