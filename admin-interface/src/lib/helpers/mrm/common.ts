export const getHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export const handleApiResponse = async (response: Response) => {
  if (!response.ok) {
    if (response.status === 401) {
      const [{ showTokenExpired }, { clearAccessToken }] = await Promise.all([
        import('$lib/stores/admin'),
        import('$lib/helpers/api/client'),
      ]);
      clearAccessToken();
      showTokenExpired.set(true);
      throw new Error('Session expired');
    }
    if (response.status === 403) {
      throw new Error('Permission denied. This administrator session cannot access this admin resource.');
    }
    const errorText = await response.text();
    let errorMessage = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.message) {
        errorMessage = Array.isArray(errorJson.message)
          ? errorJson.message.join(', ')
          : errorJson.message;
      }
    } catch (e) {
      // ignore
    }
    throw new Error(errorMessage);
  }
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
};