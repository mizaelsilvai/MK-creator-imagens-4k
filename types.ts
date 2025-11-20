
export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  model: string;
  createdAt: number;
  referenceImage?: string; // thumbnail of ref image if used
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT = '3:4',
  LANDSCAPE = '4:3',
  WIDE_PORTRAIT = '9:16',
  WIDE_LANDSCAPE = '16:9',
}

export const MODEL_IDS = {
  HIGH_QUALITY: 'imagen-4.0-generate-001',
  FAST_REFERENCE: 'gemini-2.5-flash-image',
};

export type ModelId = typeof MODEL_IDS[keyof typeof MODEL_IDS];

export type ThemeMode = 'dark' | 'light';
export type GenderTheme = 'masculine' | 'feminine';
