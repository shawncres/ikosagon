export type ScreenState = {
  cloud: boolean;
  lesson: boolean;
  deck: boolean;
  hub: boolean;
  card: string;
  start: boolean;
  flow: boolean;
};

export type CameraState = {
  zoom: number;
  panX: number;
  panY: number;
};

export function captureCloudViews(): void;
export function seedReturningLearner(): void;
export function readScreen(): ScreenState;
export function readCamera(): CameraState | null;
export function cloudSettled(minSubjects: number): boolean;
