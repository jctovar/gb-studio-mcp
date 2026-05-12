// Añadir index signature a entidades permite indexarlas por slot name sin doble cast
export interface GBSSlottable {
  [key: string]: unknown;
}

export interface GBSEvent {
  id: string;
  command: string;
  args?: Record<string, unknown>;
  children?: Record<string, GBSEvent[]>;
}

export interface GBSActor extends GBSSlottable {
  id: string;
  name: string;
  x: number;
  y: number;
  spriteSheetId?: string;
  movementType?: string;
  direction?: string;
  animate?: boolean;
  script?: GBSEvent[];
  startScript?: GBSEvent[];
  updateScript?: GBSEvent[];
  hit1Script?: GBSEvent[];
  hit2Script?: GBSEvent[];
  hit3Script?: GBSEvent[];
  symbol?: string;
}

export interface GBSTrigger extends GBSSlottable {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  script?: GBSEvent[];
  leaveScript?: GBSEvent[];
  symbol?: string;
}

export interface GBSScene extends GBSSlottable {
  id: string;
  name: string;
  backgroundId: string;
  width: number;
  height: number;
  type?: string;
  playerHitScript?: GBSEvent[];
  playerHit2Script?: GBSEvent[];
  playerHit3Script?: GBSEvent[];
  script?: GBSEvent[];
  actors: GBSActor[];
  triggers: GBSTrigger[];
  collisions?: number[];
  symbol?: string;
  notes?: string;
}

export interface GBSVariable {
  id: string;
  name: string;
  symbol?: string;
}

export interface GBSCustomEvent {
  id: string;
  name: string;
  description?: string;
  variables?: Record<string, { id: string; name: string }>;
  actors?: Record<string, { id: string; name: string }>;
  script?: GBSEvent[];
  symbol?: string;
}

export interface GBSSpriteSheet {
  id: string;
  name: string;
  filename: string;
  numFrames?: number;
  type?: string;
  symbol?: string;
}

export interface GBSBackground {
  id: string;
  name: string;
  filename: string;
  width?: number;
  height?: number;
  imageWidth?: number;
  imageHeight?: number;
  symbol?: string;
}

export interface GBSMusic {
  id: string;
  name: string;
  filename: string;
  symbol?: string;
  type?: string;
}

export interface GBSSound {
  id: string;
  name: string;
  filename: string;
  symbol?: string;
  type?: string;
}

export interface GBSFont {
  id: string;
  name: string;
  filename: string;
  symbol?: string;
}

export interface GBSProjectSettings {
  startSceneId?: string;
  playerSpriteSheetId?: string;
  defaultBackgroundPaletteIds?: string[];
  defaultSpritePaletteId?: string;
  defaultUIPaletteId?: string;
  musicDriver?: string;
  cartType?: string;
  colorMode?: string;
  sgbEnabled?: boolean;
  customColorsEnabled?: boolean;
  defaultPlayerSprites?: Record<string, string>;
  showCollisions?: boolean;
  [key: string]: unknown;
}

export interface GBSProject {
  _version: string;
  _release?: string;
  name: string;
  author?: string;
  notes?: string;
  scenes: GBSScene[];
  variables: GBSVariable[];
  customEvents: GBSCustomEvent[];
  spriteSheets: GBSSpriteSheet[];
  backgrounds: GBSBackground[];
  music: GBSMusic[];
  sounds?: GBSSound[];
  fonts?: GBSFont[];
  settings: GBSProjectSettings;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
