import fs from "node:fs";
import path from "node:path";
import type { CloudflareInitOptions } from "./init-platform.js";
import {
  getWranglerJsonImagesBinding,
  updateWranglerJsonConfigForCloudflare,
  wranglerJsonKvNamespaceNeedsId,
} from "./wrangler-json.js";
import { updateWranglerTomlConfigForCloudflare } from "./wrangler-toml.js";

type WranglerConfigFormat = "json" | "toml";

type ExistingWranglerConfig = {
  path: string;
  format: WranglerConfigFormat;
};

type ExistingWranglerConfigFile = ExistingWranglerConfig & {
  code: string;
};

export type ExistingWranglerConfigUpdatePlan = {
  path: string;
  fileName: string;
  code: string;
  imagesBinding: string;
  needsKvNamespaceId: boolean;
  changed: boolean;
};

function findExistingWranglerConfig(root: string): ExistingWranglerConfig | undefined {
  for (const fileName of ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]) {
    const candidate = path.join(root, fileName);
    if (!fs.existsSync(candidate)) continue;
    return {
      path: candidate,
      format: fileName.endsWith(".toml") ? "toml" : "json",
    };
  }
  return undefined;
}

function readExistingWranglerConfig(root: string): ExistingWranglerConfigFile | undefined {
  const config = findExistingWranglerConfig(root);
  if (!config) return undefined;
  return { ...config, code: fs.readFileSync(config.path, "utf-8") };
}

export function createExistingWranglerConfigUpdatePlan(
  root: string,
  options: CloudflareInitOptions,
): ExistingWranglerConfigUpdatePlan | undefined {
  const config = readExistingWranglerConfig(root);
  if (!config) return undefined;

  if (config.format === "json") {
    const updatedCode = updateWranglerJsonConfigForCloudflare(config.code, options);
    return {
      path: config.path,
      fileName: path.basename(config.path),
      code: updatedCode,
      imagesBinding: getWranglerJsonImagesBinding(updatedCode),
      needsKvNamespaceId: wranglerJsonKvNamespaceNeedsId(updatedCode, options),
      changed: updatedCode !== config.code,
    };
  }

  try {
    const update = updateWranglerTomlConfigForCloudflare(config.code, options);
    return {
      path: config.path,
      fileName: path.basename(config.path),
      code: update.code,
      imagesBinding: update.imagesBinding,
      needsKvNamespaceId: update.needsKvNamespaceId,
      changed: update.code !== config.code,
    };
  } catch (cause) {
    throw new Error("Could not update the existing Wrangler TOML config.", { cause });
  }
}
