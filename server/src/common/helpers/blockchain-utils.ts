import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { ethers } from 'ethers';

type ChainIdNetworkInfo = {
  chainId: number;
  rpc: string[];
};

// Function to check if an RPC URL requires an API key
const requiresApiKey = (rpcUrl: string): boolean => {
  const apiKeyPatterns = ['infura.io', 'alchemyapi.io', 'quiknode.pro'];

  return apiKeyPatterns.some((pattern) => rpcUrl.includes(pattern));
};

export const getInfoFromChainId = async (
  chainId: number,
): Promise<ChainIdNetworkInfo> => {
  try {
    // Fetch the RPC URL dynamically from Chainlist based on the chainId
    const response = await axios.get<ChainIdNetworkInfo[]>(
      `https://chainid.network/chains.json`,
    );
    const chains = response.data;
    // Use strict equality (===) to properly match the chainId
    const chainData = chains.find(
      (chain: ChainIdNetworkInfo) => chain.chainId === Number(chainId),
    );

    if (!chainData || !chainData.rpc || !chainData.rpc.length) {
      throw new BadRequestException(`No RPC URL found for chainId ${chainId}`);
    }

    // Return the chain data
    return chainData;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new BadRequestException(
      `Failed to get provider for chainId: ${chainId}. Error: ${errorMessage}`,
    );
  }
};

// Helper function to add timeout to a promise
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
};

export const getTokenSymbolByContractAddress = async (
  contractAddress: string,
  chainId: number,
): Promise<string> => {
  try {
    const chainData = await getInfoFromChainId(chainId);

    if (!chainData || !chainData.rpc.length) {
      throw new BadRequestException(`No RPC URL found for chainId ${chainId}`);
    }

    // Filter out RPC URLs that do not require an API key
    const nonApiKeyRpcs = chainData.rpc.filter(
      (rpcUrl) => !requiresApiKey(rpcUrl),
    );

    if (!nonApiKeyRpcs.length) {
      throw new BadRequestException(
        `No non-API-key RPC URLs available for chainId ${chainId}`,
      );
    }

    const timeoutMs = 5000; // 5 seconds timeout for each RPC attempt

    // Try each RPC URL one by one with a timeout
    for (const rpcUrl of nonApiKeyRpcs) {
      try {
        // Create a provider with a timeout for the connection
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        // Create a contract instance for the given address and ERC-20 ABI
        const tokenContract = new ethers.Contract(
          contractAddress,
          [
            // Minimal ABI to get only the symbol of the token
            'function symbol() view returns (string)',
          ],
          provider,
        );

        // Try fetching the token symbol with a timeout
        const tokenSymbol = await withTimeout<string>(
          tokenContract.symbol() as Promise<string>,
          timeoutMs,
        );

        // If successful, return the token symbol
        return tokenSymbol;
      } catch {
        // Continue with the next RPC URL on failure
        continue;
      }
    }

    // If all RPC URLs fail, throw an error
    throw new BadRequestException(
      `All non-API-key RPC URLs failed for chainId ${chainId}`,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new BadRequestException(
      `Failed to get token symbol: ${errorMessage}`,
    );
  }
};
