interface SceneLightRecommendationProps {
  lightId: string;
}

export const SceneLightRecommendation = (
  props: SceneLightRecommendationProps,
) => {
  return <div>{props.lightId}</div>;
};
