import { MRM_BACKEND_URL } from "$lib/helpers/constants";
import { getHeaders, handleApiResponse } from "$lib/helpers/mrm/common";
import type {
  BackfillDefinitionLinksResponse,
  PublishStrategyDefinitionVersionPayload,
  StartStopStrategyInstanceResponse,
  StartStrategyInstancePayload,
  StopStrategyInstancePayload,
  StrategyDefinition,
  StrategyDefinitionVersion,
  StrategyDefinitionPayload,
  StrategyInstanceView,
  ValidateStrategyInstanceResponse,
} from "$lib/types/hufi/strategy-definition";

export const createStrategyDefinition = async (
  payload: StrategyDefinitionPayload,
  token: string,
): Promise<StrategyDefinition> => {
  const response = await fetch(`${MRM_BACKEND_URL}/admin/strategy/definitions`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(payload),
  });

  return handleApiResponse(response);
};

export const listStrategyDefinitions = async (
  token: string,
): Promise<StrategyDefinition[]> => {
  const response = await fetch(`${MRM_BACKEND_URL}/admin/strategy/definitions`, {
    method: 'GET',
    headers: getHeaders(token),
  });

  return handleApiResponse(response);
};

export const getStrategyDefinition = async (
  id: string,
  token: string,
): Promise<StrategyDefinition> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/definitions/${id}`,
    {
      method: 'GET',
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};

export const updateStrategyDefinition = async (
  id: string,
  payload: Partial<StrategyDefinitionPayload>,
  token: string,
): Promise<StrategyDefinition> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/definitions/${id}/update`,
    {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  return handleApiResponse(response);
};

export const publishStrategyDefinitionVersion = async (
  id: string,
  payload: PublishStrategyDefinitionVersionPayload,
  token: string,
): Promise<StrategyDefinition> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/definitions/${id}/publish`,
    {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  return handleApiResponse(response);
};

export const listStrategyDefinitionVersions = async (
  id: string,
  token: string,
): Promise<StrategyDefinitionVersion[]> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/definitions/${id}/versions`,
    {
      method: 'GET',
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};

export const enableStrategyDefinition = async (
  id: string,
  token: string,
): Promise<StrategyDefinition> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/definitions/${id}/enable`,
    {
      method: 'POST',
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};

export const disableStrategyDefinition = async (
  id: string,
  token: string,
): Promise<StrategyDefinition> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/definitions/${id}/disable`,
    {
      method: 'POST',
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};

export const validateStrategyInstance = async (
  payload: StartStrategyInstancePayload,
  token: string,
): Promise<ValidateStrategyInstanceResponse> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/instances/validate`,
    {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  return handleApiResponse(response);
};

export const startStrategyInstance = async (
  payload: StartStrategyInstancePayload,
  token: string,
): Promise<StartStopStrategyInstanceResponse> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/instances/start`,
    {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  return handleApiResponse(response);
};

export const stopStrategyInstance = async (
  payload: StopStrategyInstancePayload,
  token: string,
): Promise<StartStopStrategyInstanceResponse> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/instances/stop`,
    {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  return handleApiResponse(response);
};

export const listStrategyInstances = async (
  token: string,
  runningOnly = false,
): Promise<StrategyInstanceView[]> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/instances?runningOnly=${runningOnly}`,
    {
      method: 'GET',
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};

export const backfillStrategyInstanceDefinitionLinks = async (
  token: string,
): Promise<BackfillDefinitionLinksResponse> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/strategy/instances/backfill-definition-links`,
    {
      method: 'POST',
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};
