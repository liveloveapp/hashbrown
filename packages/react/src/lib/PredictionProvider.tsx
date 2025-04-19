export interface PredictionProviderProps {
  model: string;
  temperature?: number;
  tools?: BoundTool<string, any>[];
  maxTokens?: number;
  responseFormat?: s.AnyType;
}

export const PredictionProvider = () => {
  return <div>PredictionProvider</div>;
};
