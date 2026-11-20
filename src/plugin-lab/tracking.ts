import { readonly, ref } from 'vue'

export interface TrackingEvent {
  name: string
  occurredAt: string
}

const events = ref<TrackingEvent[]>([])

export const trackingEvents = readonly(events)

export function track(name: string) {
  events.value.push({ name, occurredAt: new Date().toISOString() })
}
