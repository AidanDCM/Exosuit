import { EncryptedFileWorkflowCheckpointStore } from "./encryptedCheckpointStore.js";
import { FileWorkflowCheckpointStore } from "./fileCheckpointStore.js";
import { WorkflowRuntime, type WorkflowCheckpointStore } from "./workflowRuntime.js";

export type WorkflowPersistenceMode = "memory" | "file" | "encrypted_file";

export type WorkflowRuntimeBundle = {
  runtime: WorkflowRuntime;
  persistenceMode: WorkflowPersistenceMode;
  stateDirectory?: string;
};

export function createWorkflowRuntimeFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): WorkflowRuntimeBundle {
  const stateDirectory = environment.EXOSUIT_WORKFLOW_STATE_DIR?.trim();
  const encryptionKey = environment.EXOSUIT_WORKFLOW_STATE_KEY?.trim();
  const maxCheckpointBytes = parseOptionalPositiveInteger(
    environment.EXOSUIT_WORKFLOW_MAX_CHECKPOINT_BYTES,
    "EXOSUIT_WORKFLOW_MAX_CHECKPOINT_BYTES",
  );

  if (encryptionKey && !stateDirectory) {
    throw new Error("EXOSUIT_WORKFLOW_STATE_KEY requires EXOSUIT_WORKFLOW_STATE_DIR.");
  }
  if (!stateDirectory) {
    if (maxCheckpointBytes !== undefined) {
      throw new Error("EXOSUIT_WORKFLOW_MAX_CHECKPOINT_BYTES requires EXOSUIT_WORKFLOW_STATE_DIR.");
    }
    return { runtime: new WorkflowRuntime(), persistenceMode: "memory" };
  }

  const optionalLimit = maxCheckpointBytes === undefined ? {} : { maxCheckpointBytes };
  let checkpoints: WorkflowCheckpointStore;
  let persistenceMode: WorkflowPersistenceMode;
  if (encryptionKey) {
    checkpoints = new EncryptedFileWorkflowCheckpointStore({
      directory: stateDirectory,
      key: encryptionKey,
      ...optionalLimit,
    });
    persistenceMode = "encrypted_file";
  } else {
    checkpoints = new FileWorkflowCheckpointStore({
      directory: stateDirectory,
      ...optionalLimit,
    });
    persistenceMode = "file";
  }

  return {
    runtime: new WorkflowRuntime({ checkpoints }),
    persistenceMode,
    stateDirectory,
  };
}

function parseOptionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}
