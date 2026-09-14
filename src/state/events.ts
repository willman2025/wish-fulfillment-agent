import type { AppEvent, EventType } from '../types'

let counter = 0

export function createEvent(
  type: EventType,
  payload?: Record<string, unknown>,
): AppEvent {
  counter += 1
  return {
    id: `evt_${Date.now()}_${counter}`,
    type,
    at: new Date().toISOString(),
    payload,
  }
}

export function appendEvent(
  events: AppEvent[],
  type: EventType,
  payload?: Record<string, unknown>,
): AppEvent[] {
  return [...events, createEvent(type, payload)]
}
