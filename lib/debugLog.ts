import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface DebugEvent {
  id: string;
  name: string;
  tag: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

const MAX_EVENTS = 50;
const STORAGE_KEY = 'debug_recent_events';
let inMemoryEvents: DebugEvent[] = [];

// Load any previously persisted events so the debug screen can show history
// across cold restarts.
async function loadEvents(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw) {
      inMemoryEvents = JSON.parse(raw);
    }
  } catch {
    // ignore
  }
}

async function persistEvents(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const trimmed = inMemoryEvents.slice(0, MAX_EVENTS);
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore — best effort
  }
}

// Fire and forget the initial load
loadEvents().catch(() => {});

export function logDebugEvent(
  name: string,
  data?: Record<string, unknown>,
): void {
  // Derive a tag from the event name for display in the debug screen
  const tag = name.toUpperCase().replace(/[^A-Z0-9_ ]/g, '').trim();

  const event: DebugEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    tag,
    data,
    timestamp: new Date().toISOString(),
  };

  inMemoryEvents.unshift(event);
  if (inMemoryEvents.length > MAX_EVENTS) {
    inMemoryEvents = inMemoryEvents.slice(0, MAX_EVENTS);
  }

  // Also log to console so it appears in the dev console
  console.log(`[DebugEvent] ${name}`, data ?? '');

  // Persist asynchronously
  persistEvents().catch(() => {});
}

export function getRecentEvents(): DebugEvent[] {
  return inMemoryEvents;
}

export function clearRecentEvents(): void {
  inMemoryEvents = [];
  persistEvents().catch(() => {});
}
