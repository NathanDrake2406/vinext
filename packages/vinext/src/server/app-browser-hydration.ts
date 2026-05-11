import type { hydrateRoot, ReactFormState } from "react-dom/client";

type HydrateRootOptions = NonNullable<Parameters<typeof hydrateRoot>[2]>;
type HydrateRootCaughtErrorHandler = NonNullable<HydrateRootOptions["onCaughtError"]>;
type HydrateRootUncaughtErrorHandler = NonNullable<HydrateRootOptions["onUncaughtError"]>;

type FormStateGlobal = {
  __VINEXT_RSC_FORM_STATE__?: ReactFormState;
};

export function consumeInitialFormState(global: FormStateGlobal): ReactFormState | null {
  const formState = global.__VINEXT_RSC_FORM_STATE__ ?? null;
  delete global.__VINEXT_RSC_FORM_STATE__;
  return formState;
}

export function createVinextHydrateRootOptions(options: {
  formState: ReactFormState | null;
  isDev: boolean;
  onCaughtError: HydrateRootCaughtErrorHandler;
  onUncaughtError: HydrateRootUncaughtErrorHandler;
}): HydrateRootOptions {
  if (options.isDev) {
    return {
      formState: options.formState,
      onCaughtError: options.onCaughtError,
      onUncaughtError: options.onUncaughtError,
    };
  }

  return {
    formState: options.formState,
    onUncaughtError: options.onUncaughtError,
  };
}
