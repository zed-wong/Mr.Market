import { MRM_BACKEND_URL } from "$lib/helpers/constants";
import { getHeaders, handleApiResponse } from "$lib/helpers/mrm/common";
import type { AdminAPIKeyAccountSnapshot, AdminSingleKey } from "$lib/types/hufi/admin";

export const getAllAPIKeys = async (token: string): Promise<AdminSingleKey[]> => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/admin/exchanges/keys`, {
      method: "GET",
      headers: getHeaders(token),
    });
    return handleApiResponse(response);
  } catch (error) {
    console.error("Error getting all API keys:", error);
    throw error;
  }
}

export const addAPIKey = async (keyDto: Partial<AdminSingleKey>, token: string): Promise<unknown> => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/admin/exchanges/keys`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(keyDto),
    });
    return handleApiResponse(response);
  } catch (error) {
    console.error("Error adding API key:", error);
    throw error;
  }
}

export const removeAPIKey = async (keyId: string, token: string): Promise<unknown> => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/admin/exchanges/keys/${keyId}`, {
      method: "DELETE",
      headers: getHeaders(token),
    });
    return handleApiResponse(response);
  } catch (error) {
    console.error("Error removing API key:", error);
    throw error;
  }
}

export const getAPIKeyAccountSnapshot = async (
  keyId: string,
  token: string,
): Promise<AdminAPIKeyAccountSnapshot> => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/admin/exchanges/keys/${keyId}/account`, {
      method: "GET",
      headers: getHeaders(token),
    });
    return handleApiResponse(response);
  } catch (error) {
    console.error("Error getting API key account snapshot:", error);
    throw error;
  }
}

export const getEncryptionPublicKey = async (token: string): Promise<{ publicKey: string }> => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/admin/exchanges/key-pair`, {
      method: "GET",
      headers: getHeaders(token),
    });
    return handleApiResponse(response);
  } catch (error) {
    console.error("Error fetching public key:", error);
    throw error;
  }
}
