export const createFlowSteps = [
  {
    key: 'pair',
    labelKey: 'market_making_create_step_pair',
    detailKey: 'market_making_create_step_pair_detail',
    panelTestId: 'order-pair-panel',
  },
  {
    key: 'funds',
    labelKey: 'market_making_create_step_funds',
    detailKey: 'market_making_create_step_funds_detail',
    panelTestId: 'order-funds-panel',
  },
  {
    key: 'review',
    labelKey: 'market_making_create_step_review',
    detailKey: 'market_making_create_step_review_detail',
    panelTestId: 'order-review-panel',
  },
] as const;

export type CreateFlowStep = (typeof createFlowSteps)[number]['key'];

export type CreateStepPanelState = (typeof createFlowSteps)[number] & {
  hidden: boolean;
};

export const isCreateFlowStep = (step: string | null | undefined): step is CreateFlowStep =>
  createFlowSteps.some((flowStep) => flowStep.key === step);

export const getCreateStepPanelState = (
  activeStep: CreateFlowStep
): Record<CreateFlowStep, CreateStepPanelState> =>
  Object.fromEntries(
    createFlowSteps.map((step) => [
      step.key,
      {
        ...step,
        hidden: activeStep !== step.key,
      },
    ])
  ) as Record<CreateFlowStep, CreateStepPanelState>;

export const isCreateStepPanelHidden = (
  activeStep: CreateFlowStep,
  panelStep: CreateFlowStep
): boolean => getCreateStepPanelState(activeStep)[panelStep].hidden;
