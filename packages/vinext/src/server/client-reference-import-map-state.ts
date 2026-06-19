import {
  createClientReferenceImportIndex,
  type ClientReferenceImportIndex,
  type ClientReferenceImportMap,
} from "./client-reference-imports.js";

let clientReferenceImportMapAvailable = false;
let clientReferenceImportIndex: ClientReferenceImportIndex = new Map();

export function setClientReferenceImportMap(importIds: ClientReferenceImportMap): void {
  clientReferenceImportIndex = createClientReferenceImportIndex(importIds);
  clientReferenceImportMapAvailable = true;
}

export function isClientReferenceImportMapAvailable(): boolean {
  return clientReferenceImportMapAvailable;
}

export function getClientReferenceImportIndex(): ClientReferenceImportIndex {
  return clientReferenceImportIndex;
}
