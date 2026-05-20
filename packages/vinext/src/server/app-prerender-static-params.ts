import { pickRootParams, runWithRootParamsScope, type RootParams } from "vinext/shims/root-params";

type GenerateStaticParamsFunction = (input: { params: RootParams }) => unknown;

function isGenerateStaticParamsFunction(value: unknown): value is GenerateStaticParamsFunction {
  return typeof value === "function";
}

function isRootParams(value: unknown): value is RootParams {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createAppPrerenderStaticParamsResolver(
  sources: readonly unknown[],
  rootParamNames?: readonly string[],
): GenerateStaticParamsFunction | null {
  const generateStaticParamsFns = sources.filter(isGenerateStaticParamsFunction);
  if (generateStaticParamsFns.length === 0) return null;

  const rootParamNamesSet = rootParamNames ? new Set(rootParamNames) : null;
  const filterRootParams = (params: RootParams): RootParams => {
    if (!rootParamNamesSet) return params;
    const picked: RootParams = {};
    for (const [key, value] of Object.entries(params)) {
      if (rootParamNamesSet.has(key)) {
        picked[key] = value;
      }
    }
    return picked;
  };

  if (generateStaticParamsFns.length === 1) {
    const single = generateStaticParamsFns[0];
    // Wrap the single source in the same non-array/non-object guards as the
    // multi-source composition path so the contract is uniform regardless of
    // how many sources were composed.
    return async (input) => {
      const picked = filterRootParams(input.params);
      return runWithRootParamsScope(picked, async () => {
        const result = await single(input);
        if (!Array.isArray(result)) return [];
        for (const item of result) {
          if (!isRootParams(item)) return [];
        }
        return result;
      });
    };
  }

  return async ({ params }) => {
    const picked = filterRootParams(params);
    let paramSets: RootParams[] = [picked];

    for (const generateStaticParams of generateStaticParamsFns) {
      const nextParamSets: RootParams[] = [];

      for (const parentParams of paramSets) {
        const pickedParent = filterRootParams(parentParams);
        const result = await runWithRootParamsScope(pickedParent, async () =>
          generateStaticParams({ params: parentParams }),
        );
        if (!Array.isArray(result)) return [];

        for (const item of result) {
          if (!isRootParams(item)) return [];
          nextParamSets.push({ ...parentParams, ...item });
        }
      }

      paramSets = nextParamSets;
    }

    return paramSets;
  };
}

type CallAppPrerenderStaticParamsOptions = {
  fn: GenerateStaticParamsFunction;
  params: RootParams;
  pattern: string;
  rootParamNamesByPattern: Record<string, readonly string[] | undefined>;
};

export async function callAppPrerenderStaticParams(
  options: CallAppPrerenderStaticParamsOptions,
): Promise<unknown> {
  const picked = pickRootParams(options.params, options.rootParamNamesByPattern[options.pattern]);
  return runWithRootParamsScope(picked, () => options.fn({ params: options.params }));
}
