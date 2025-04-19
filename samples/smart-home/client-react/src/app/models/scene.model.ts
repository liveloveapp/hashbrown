export interface SceneLight {
  lightId: string;
  brightness: number;
}

export interface Scene {
  id: string;
  name: string;
  lights: SceneLight[];
}
