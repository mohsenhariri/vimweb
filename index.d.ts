export type VimNavKey = "f" | "j" | "k" | "gg" | "G" | "?";

export interface VimNavAppearance {
  template?: "classic" | "minimal" | "terminal" | undefined;
  palette?: "amber" | "ocean" | "forest" | undefined;
  mode?: "auto" | "light" | "dark" | undefined;
}

export interface VimNavOptions {
  appearance?: VimNavAppearance;
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
  /** Update selected appearance options, including any open guide or hint labels. */
  setAppearance(patch: VimNavAppearance): void;
  readonly enabled: boolean;
  enable(): void;
  disable(): void;
  /** Open link hints if the command is enabled and focus allows it. */
  showHints(): void;
  showHelp(): void;
  destroy(): void;
}

export function createVimNav(options?: VimNavOptions): VimNav;
