#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(process.cwd());
const runner = join(repositoryRoot, "scripts", "windows", "Invoke-ExosuitFieldValidation.ps1");
const result = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    runner,
    "-RepositoryRoot",
    repositoryRoot,
  ],
  { cwd: repositoryRoot, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
