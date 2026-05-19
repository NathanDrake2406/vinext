import { pickRootParams, setRootParams, type RootParams } from "vinext/shims/root-params";

type GenerateStaticParamsFunction = (input: { params: RootParams }) => unknown;

function isGenerateStaticParamsFunction(value: unknown): value is GenerateStaticParamsFunction {
  return typeof value === "function";
}

function isRootParams(value: unknown): value is RootParams {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createAppPrerenderStaticParamsResolver(
  sources: readonly unknown[],
): GenerateStaticParamsFunction | null {
  const generateStaticParamsFns = sources.filter(isGenerateStaticParamsFunction);
  if (generateStaticParamsFns.length === 0) return null;
  if (generateStaticParamsFns.length === 1) return generateStaticParamsFns[0];

  return async ({ params }) => {
    let paramSets: RootParams[] = [params];

    for (const generateStaticParams of generateStaticParamsFns) {
      const nextParamSets: RootParams[] = [];

      for (const parentParams of paramSets) {
        const result = await generateStaticParams({ params: parentParams });
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
  setRootParams(pickRootParams(options.params, options.rootParamNamesByPattern[options.pattern]));
  try {
    return await options.fn({ params: options.params });
  } finally {
    setRootParams(null);
  }
}
