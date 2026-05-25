export interface SetupStatusResponse {
  initialized: boolean;
  seededAt: string | null;
  completedAt: string | null;
  completedSteps: Record<string, boolean>;
  seedRequired: boolean;
}

export interface SetupPasswordBody {
  password?: string;
}

export interface SetupEnvBody {
  values?: Record<string, string | number | boolean | null | undefined>;
}
