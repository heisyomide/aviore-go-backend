export class OnboardingProgressEntity {
  currentStep!: number;

  completedSteps!: number[];

  percentage!: number;

  status!: string;

  isCompleted!: boolean;

  lastUpdated!: Date;
}