import { describe, expect, it, vi } from "vitest";
import type { PluginFileOpenHandlerContribution } from "@getpaseo/plugin/client";
import { BUILTIN_FILE_OPEN_HANDLER_ID } from "@/workspace/file-open";
import { collectFileOpenHandlers, resolveFileOpenHandler, routeWorkspaceFileOpen } from "./index";
import type { InstalledPlugin } from "../types";

function installedPlugin(
  input: Partial<InstalledPlugin> & { id: string; serverId: string },
): InstalledPlugin {
  return {
    lifetime: new AbortController(),
    clientBundle: "",
    queryClient: {} as InstalledPlugin["queryClient"],
    paseo: {} as InstalledPlugin["paseo"],
    invoke: async () => undefined,
    cleanup: () => undefined,
    surfaces: [],
    settingsScreens: [],
    sidebarItems: { header: [], footer: [] },
    legacySidebarItems: [],
    workspacePanels: [],
    commandCenterItems: [],
    clientSlashCommands: [],
    attachmentSources: [],
    fileOpenHandlers: [],
    themes: [],
    timelineTransformers: [],
    timelineRenderers: [],
    ...input,
  };
}

function handler(
  input: Partial<PluginFileOpenHandlerContribution> & { id: string },
): PluginFileOpenHandlerContribution {
  return { label: input.id, open: () => undefined, ...input };
}

const target = {
  workspaceId: "workspace",
  directory: "/srv/checkout",
  location: { path: "src/index.ts", lineStart: 12 },
};

describe("collectFileOpenHandlers", () => {
  it("offers every host's handlers once, ordered by id", () => {
    const plugins = [
      installedPlugin({
        id: "cell-editor",
        serverId: "host-b",
        fileOpenHandlers: [handler({ id: "cell-editor", label: "Cell editor (B)" })],
      }),
      installedPlugin({
        id: "cell-editor",
        serverId: "host-a",
        fileOpenHandlers: [handler({ id: "cell-editor", label: "Cell editor (A)" })],
      }),
      installedPlugin({
        id: "acme",
        serverId: "host-a",
        fileOpenHandlers: [handler({ id: "acme-editor", label: "Acme" })],
      }),
    ];

    expect(collectFileOpenHandlers(plugins)).toEqual([
      { id: "acme-editor", label: "Acme" },
      { id: "cell-editor", label: "Cell editor (B)" },
    ]);
  });
});

describe("resolveFileOpenHandler", () => {
  const plugins = [
    installedPlugin({
      id: "cell-editor",
      serverId: "host-a",
      fileOpenHandlers: [handler({ id: "cell-editor" })],
    }),
  ];

  it("answers only for the workspace's own host", () => {
    expect(
      resolveFileOpenHandler({ plugins, serverId: "host-a", handlerId: "cell-editor" })?.id,
    ).toBe("cell-editor");
    expect(
      resolveFileOpenHandler({ plugins, serverId: "host-b", handlerId: "cell-editor" }),
    ).toBeNull();
    expect(
      resolveFileOpenHandler({ plugins, serverId: undefined, handlerId: "cell-editor" }),
    ).toBeNull();
  });

  it("never answers for the built-in viewer", () => {
    expect(
      resolveFileOpenHandler({
        plugins,
        serverId: "host-a",
        handlerId: BUILTIN_FILE_OPEN_HANDLER_ID,
      }),
    ).toBeNull();
  });
});

describe("routeWorkspaceFileOpen", () => {
  function pluginsWith(contribution: PluginFileOpenHandlerContribution): InstalledPlugin[] {
    return [
      installedPlugin({
        id: "cell-editor",
        serverId: "host-a",
        fileOpenHandlers: [contribution],
      }),
    ];
  }

  const route = (plugins: InstalledPlugin[], handlerId = "cell-editor") =>
    routeWorkspaceFileOpen({ plugins, serverId: "host-a", handlerId, target });

  it("hands the handler an absolute path and the reference's line", async () => {
    const open = vi.fn();
    await expect(route(pluginsWith(handler({ id: "cell-editor", open })))).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith({
      workspaceId: "workspace",
      directory: "/srv/checkout",
      path: "/srv/checkout/src/index.ts",
      line: 12,
    });
  });

  it("leaves the file to the built-in pane when canOpen declines", async () => {
    const open = vi.fn();
    await expect(
      route(pluginsWith(handler({ id: "cell-editor", canOpen: () => false, open }))),
    ).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("leaves the file to the built-in pane when the handler throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      route(
        pluginsWith(
          handler({
            id: "cell-editor",
            open: () => Promise.reject(new Error("no workbench")),
          }),
        ),
      ),
    ).resolves.toBe(false);
    await expect(
      route(
        pluginsWith(
          handler({
            id: "cell-editor",
            canOpen: () => {
              throw new Error("no oracle");
            },
            open: vi.fn(),
          }),
        ),
      ),
    ).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("leaves the file to the built-in pane when the handler is gone", async () => {
    await expect(route([])).resolves.toBe(false);
    await expect(
      route(pluginsWith(handler({ id: "cell-editor" })), "uninstalled-editor"),
    ).resolves.toBe(false);
  });

  it("refuses a target it cannot name", async () => {
    const open = vi.fn();
    const plugins = pluginsWith(handler({ id: "cell-editor", open }));
    for (const broken of [
      { ...target, directory: "  " },
      { ...target, workspaceId: "" },
      { ...target, location: { path: "   " } },
    ]) {
      await expect(
        routeWorkspaceFileOpen({
          plugins,
          serverId: "host-a",
          handlerId: "cell-editor",
          target: broken,
        }),
      ).resolves.toBe(false);
    }
    expect(open).not.toHaveBeenCalled();
  });
});
