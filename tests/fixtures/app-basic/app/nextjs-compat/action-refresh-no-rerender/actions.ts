"use server";

import { setFlag } from "./state";

export async function setFlagAction(value: boolean): Promise<boolean> {
  return setFlag(value);
}
