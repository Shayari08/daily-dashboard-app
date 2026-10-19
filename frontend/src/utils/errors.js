// Turn an axios error into a short, user-readable reason
export const describeError = (error) => {
  if (!error.response) return 'cannot reach the backend. Make sure it is running (start-dashboard.bat).';
  const data = error.response.data || {};
  return data.details || data.error?.message || data.error || error.message;
};
