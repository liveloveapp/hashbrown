export interface Light {
  id: string;
  name: string;
  brightness: number;
}

export interface SceneLight {
  lightId: string;
  brightness: number;
}

export interface Scene {
  id: string;
  name: string;
  lights: SceneLight[];
}
