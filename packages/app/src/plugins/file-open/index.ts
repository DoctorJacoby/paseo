import { useMemo } from "react";
import type { PluginFileOpenHandlerContribution } from "@getpaseo/plugin/client";
import {
  BUILTIN_FILE_OPEN_HANDLER_ID,
  resolveWorkspaceFilePaths,
  type WorkspaceFileLocation,
} from "@/workspace/file-open";
import { useInstalledPlugins } from "../registry";
import type { InstalledPlugin } from "../types";

/** One row of the file-open setting's picker, below the built-in viewer. */
export interface FileOpenHandlerOption {
  id: string;
  label: string;
}

export interface FileOpenTarget {
  workspaceId: string;
  /** The workspace's directory on the host; without one nothing can be resolved. */
  directory: string;
  location: WorkspaceFileLocation;
}

/**
 * Every handler registered by a plugin on any connected host, deduplicated by id and
 * ordered by it. The setting is device-wide while a handler belongs to one host, so the
 * picker offers the union and {@link resolveFileOpenHandler} narrows to the workspace's
 * own host at open time.
 */
export function collectFileOpenHandlers(plugins: InstalledPlugin[]): FileOpenHandlerOption[] {
  const byId = new Map<string, FileOpenHandlerOption>();
  for (const plugin of plugins) {
    for (const handler of plugin.fileOpenHandlers) {
      if (!byId.has(handler.id)) byId.set(handler.id, { id: handler.id, label: handler.label });
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function useFileOpenHandlerCatalog(): FileOpenHandlerOption[] {
  const plugins = useInstalledPlugins();
  return useMemo(() => collectFileOpenHandlers(plugins), [plugins]);
}

/**
 * The handler the setting names, as registered on the host the workspace lives on. A
 * handler reaches its host over that host's own RPCs, so one registered against another
 * connection is not a substitute: the answer there is null, and the caller opens the file
 * in the built-in pane.
 */
export function resolveFileOpenHandler(input: {
  plugins: InstalledPlugin[];
  serverId: string | undefined;
  handlerId: string;
}): PluginFileOpenHandlerContribution | null {
  if (!input.serverId || input.handlerId === BUILTIN_FILE_OPEN_HANDLER_ID) return null;
  for (const plugin of input.plugins) {
    if (plugin.serverId !== input.serverId) continue;
    const handler = plugin.fileOpenHandlers.find((entry) => entry.id === input.handlerId);
    if (handler) return handler;
  }
  return null;
}

/**
 * Hands a file reference to the chosen handler, and reports whether it took it. False
 * means the caller opens the file the way it always did — the built-in pane is the
 * fallback for a handler that is gone, that declines the file, or that throws.
 */
export async function routeWorkspaceFileOpen(input: {
  plugins: InstalledPlugin[];
  serverId: string | undefined;
  handlerId: string;
  target: FileOpenTarget;
}): Promise<boolean> {
  const handler = resolveFileOpenHandler(input);
  if (!handler) return false;
  const request = buildFileOpenRequest(input.target);
  if (!request) return false;
  try {
    if (handler.canOpen && !handler.canOpen(request)) return false;
  } catch (error) {
    console.warn(`[Plugins] File open handler ${handler.id} failed in canOpen`, error);
    return false;
  }
  try {
    await handler.open(request);
    return true;
  } catch (error) {
    console.warn(`[Plugins] File open handler ${handler.id} failed to open a file`, error);
    return false;
  }
}

function buildFileOpenRequest(target: FileOpenTarget): {
  workspaceId: string;
  directory: string;
  path: string;
  line?: number;
} | null {
  const directory = target.directory.trim();
  const path = target.location.path.trim();
  if (!target.workspaceId || !directory || !path) return null;
  // An absolute host path where one can be derived, because that is what a handler on the
  // other side of an RPC can act on; a path that will not resolve travels as written.
  const resolved = resolveWorkspaceFilePaths({ path, workspaceRoot: directory });
  return {
    workspaceId: target.workspaceId,
    directory,
    path: resolved?.absolutePath ?? path,
    ...(target.location.lineStart ? { line: target.location.lineStart } : {}),
  };
}
