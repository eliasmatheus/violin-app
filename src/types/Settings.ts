export const MAIN_BACKGROUND_ID = "main_background";
export const DEFAULT_BACKGROUND_COLOR = "#000000";

export interface Settings {
  id: string
  color: string
  position?: string
  image?: ArrayBuffer
  mime?: string
}

export interface BackgroundSoundSettings {
  fadeIn: number;
  fadeOut: number;
  autoPause: boolean;
  repeat: boolean;
}
