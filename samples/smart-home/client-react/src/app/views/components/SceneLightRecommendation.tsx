import { useSmartHomeStore } from '../../store/smart-home.store';

interface SceneLightRecommendationProps {
  lightId: string;
  brightness: number;
}

export const SceneLightRecommendation = (
  props: SceneLightRecommendationProps,
) => {
  const { lightId, brightness } = props;

  const lights = useSmartHomeStore((state) => state.lights);
  const light = lights.find((l) => l.id === lightId);

  if (!light) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-2 border rounded">
      <span>{light.name}</span>
      <span>{brightness}%</span>
    </div>
  );
};
