import { MRM_BACKEND_URL } from "$lib/helpers/constants";
import { getHeaders, handleApiResponse } from "$lib/helpers/mrm/common";
import type {
  CampaignJoinPayload,
  CampaignJoinRecord,
  DirectOrderStatus,
  DirectOrderSummary,
  DirectStartPayload,
  DirectWalletStatus,
} from "$lib/types/hufi/admin-direct-market-making";

export const listDirectOrders = async (
  token: string,
): Promise<DirectOrderSummary[]> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/market-making/direct-orders`,
    {
      method: "GET",
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};

export const startDirectOrder = async (
  payload: DirectStartPayload,
  token: string,
): Promise<{ orderId: string; state: string; warnings: string[] }> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/market-making/direct-start`,
    {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  return handleApiResponse(response);
};

export const stopDirectOrder = async (
  orderId: string,
  token: string,
): Promise<{ orderId: string; state: string }> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/market-making/direct-stop`,
    {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({ orderId }),
    },
  );

  return handleApiResponse(response);
};

export const getDirectOrderStatus = async (
  orderId: string,
  token: string,
): Promise<DirectOrderStatus> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/market-making/direct-orders/${orderId}/status`,
    {
      method: "GET",
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};

export const listAdminCampaigns = async (
  token: string,
): Promise<Array<Record<string, unknown>>> => {
  const response = await fetch(`${MRM_BACKEND_URL}/admin/market-making/campaigns`, {
    method: "GET",
    headers: getHeaders(token),
  });

  return handleApiResponse(response);
};

export const joinAdminCampaign = async (
  payload: CampaignJoinPayload,
  token: string,
): Promise<CampaignJoinRecord> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/market-making/campaign-join`,
    {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  return handleApiResponse(response);
};

export const listCampaignJoins = async (
  token: string,
): Promise<CampaignJoinRecord[]> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/market-making/campaign-joins`,
    {
      method: "GET",
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};

export const getDirectWalletStatus = async (
  token: string,
): Promise<DirectWalletStatus> => {
  const response = await fetch(
    `${MRM_BACKEND_URL}/admin/market-making/wallet-status`,
    {
      method: "GET",
      headers: getHeaders(token),
    },
  );

  return handleApiResponse(response);
};
