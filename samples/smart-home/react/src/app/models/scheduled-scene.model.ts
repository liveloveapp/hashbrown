export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface RecurrenceRule {
  weekdays: Weekday[];
}

export interface ScheduledScene {
  id: string;
  sceneId: string;
  startDate: Date;
  recurrenceRule?: RecurrenceRule;
  isEnabled: boolean;
}
