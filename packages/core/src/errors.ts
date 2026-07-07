export type HarnessErrorCode = "findings" | "usage" | "env";

/** Exit codes per CLI spec: 1 findings/failures, 2 usage/config, 3 environment. */
export const EXIT_CODES: Record<HarnessErrorCode, number> = {
  findings: 1,
  usage: 2,
  env: 3,
};

export class HarnessError extends Error {
  constructor(
    readonly code: HarnessErrorCode,
    message: string,
    readonly fix?: string,
  ) {
    super(message);
    this.name = "HarnessError";
  }
}
