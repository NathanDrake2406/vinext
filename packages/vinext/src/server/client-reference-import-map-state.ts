import type { ClientReferenceImportMap } from "./client-reference-imports.js";

let clientReferenceImportMapAvailable = false;
let clientReferenceImportIds: ClientReferenceImportMap = {};

export function setClientReferenceImportMap(importIds: ClientReferenceImportMap): void {
  clientReferenceImportIds = importIds;
  clientReferenceImportMapAvailable = true;
}

export function isClientReferenceImportMapAvailable(): boolean {
  return clientReferenceImportMapAvailable;
}

export function getClientReferenceImportMap(): ClientReferenceImportMap {
  return clientReferenceImportIds;
}
