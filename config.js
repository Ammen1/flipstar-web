// API Configuration for different environments
const getApiConfig = () => {
  return {
    API_BASE_URL: 'https://uat.flipstar.et/api',
    ENVIRONMENT: 'production'
  };
};

const config = getApiConfig();

export default config;




