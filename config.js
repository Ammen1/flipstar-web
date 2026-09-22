// API Configuration — values come from Vite env variables (VITE_* prefix)
// so they are embedded at build time.  Falls back to UAT defaults.
const getApiConfig = () => {
  return {
    API_BASE_URL:
      (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'https://api.uat.flipstar.et/api/v1',
    ENVIRONMENT:
      (import.meta.env && import.meta.env.VITE_ENVIRONMENT) || 'development',
  };
};

const config = getApiConfig();

export default config;
