/**
 * All 8 pipeline stages render. The old `slice(0,6)` silently hid
 * "Application Received" and "Approved", making guests in those stages
 * disappear (P0-d). This helper exists so the no-drop guarantee is tested.
 */
export function visibleKanbanStages<T>(stages: T[]): T[] {
  return stages;
}
