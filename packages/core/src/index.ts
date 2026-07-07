export { HarnessError, EXIT_CODES, type HarnessErrorCode } from "./errors";
export { HARNESS_VERSION } from "./version";
export { buildFileIndex, type FileIndex } from "./fsindex";
export { scan, type ScanOptions } from "./scan";
export { gitCommitCount } from "./gitinfo";
export { loadConfig, type LoadedConfig, HARNESS_DIR, CONFIG_PATH, MANIFEST_PATH } from "./config";
export { computeInputsHash, isTrackedInput } from "./hash";
export { isManagedPath } from "./managed";
