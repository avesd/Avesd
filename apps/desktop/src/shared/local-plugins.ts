import type { WidgetDefinition, WidgetWorkspaceCapability } from "@avesd/workspace-model";
import type { WebSurfaceBounds } from "./web-surface";

export interface LocalPluginManifest {
  readonly capabilities?: readonly WidgetWorkspaceCapability[];
  readonly apiVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly widgetTypeId: string;
  readonly size: { readonly width: number; readonly height: number };
}

export type WidgetTestStep =
  | { readonly type: "click"; readonly selector: string }
  | { readonly type: "fill"; readonly selector: string; readonly value: string }
  | { readonly type: "expectText"; readonly selector: string; readonly text: string };

export interface LocalPluginDraft {
  readonly id: string;
  readonly revision: string;
  readonly manifest: LocalPluginManifest;
  readonly source: string;
  readonly tests: readonly WidgetTestStep[];
}

export interface LocalPluginSummary {
  readonly manifest: LocalPluginManifest;
  readonly revision: string;
}

export interface PluginTestReport {
  readonly draftId: string;
  readonly revision: string;
  readonly passed: boolean;
  readonly checks: readonly { readonly name: string; readonly passed: boolean; readonly message?: string }[];
}

export type LocalWidgetCommand =
  | { readonly type: "create"; readonly widgetId: string }
  | { readonly type: "destroy"; readonly id: string }
  | { readonly type: "bounds"; readonly id: string; readonly bounds: WebSurfaceBounds };

export interface LocalPluginsApi {
  list(): Promise<readonly LocalPluginSummary[]>;
  subscribe(listener: () => void): () => void;
  surface(command: LocalWidgetCommand): Promise<{ readonly id: string }>;
}

export const localPluginsChannels = {
  list: "local-plugins:list", changed: "local-plugins:changed", surface: "local-plugins:surface",
} as const;

export const localWidgetDefinition = (manifest: LocalPluginManifest): WidgetDefinition => ({
  capabilities: manifest.capabilities,
  pluginId: manifest.id, widgetTypeId: manifest.widgetTypeId, displayName: manifest.displayName,
  configurationVersion: 1, defaultConfiguration: {}, inputs: [], defaultSize: manifest.size,
  sizePolicy: { kind: "fixed", sizes: [manifest.size] },
});
