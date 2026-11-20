export type VimNavKey = "f" | "j" | "k" | "gg" | "G" | "?";

export interface VimNavOptions {
  document?: Document;
  enabled?: boolean;
  /** At least two distinct lowercase ASCII letters. */
  alphabet?: string;
  /** CSS selector for regions that own their keyboard interaction. */
  exclude?: string;
  disabledKeys?: readonly VimNavKey[];
  onEnabledChange?: (enabled: boolean) => void;
}

export interface VimNav {
  readonly enabled: boolean;
  enable(): void;
  disable(): void;
  showHelp(): void;
  destroy(): void;
}

export function createVimNav(options?: VimNavOptions): VimNav;
