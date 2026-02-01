import { getUserOrderMarketMakingById, getMarketMakingHistoryByInstanceId } from "$lib/helpers/mrm/strategy";

export async function load({ params }: { params: { id: string } }) {
  const [order, history] = await Promise.all([
    getUserOrderMarketMakingById(params.id),
    getMarketMakingHistoryByInstanceId(params.id)
  ]);

  return {
    order,
    history
  };
}
