/**
 * SportsQuant Pro — PROTO Forward Shadow Operation Log Engine
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Appends structured operation run logs for every cycle execution.
 * 2. Dedicated store section inside data/protoForwardShadowStore.json.
 */

import { ProtoOperationLog } from "./protoForwardShadowTypes.js";
import {
  loadProtoForwardShadowStore,
  saveProtoForwardShadowStore
} from "./protoForwardShadowStore.js";

/**
 * Appends a structured run-cycle operation log to store
 */
export function logOperationRun(log: ProtoOperationLog): void {
  const store = loadProtoForwardShadowStore();
  if (!store.operationLogs) store.operationLogs = [];

  store.operationLogs.push(log);
  saveProtoForwardShadowStore(store);
}

/**
 * Retrieves all operation run logs
 */
export function getOperationLogs(): ProtoOperationLog[] {
  const store = loadProtoForwardShadowStore();
  return store.operationLogs || [];
}

/**
 * Retrieves the latest operation run log
 */
export function getLatestOperationRun(): ProtoOperationLog | null {
  const logs = getOperationLogs();
  return logs.length > 0 ? logs[logs.length - 1] : null;
}
