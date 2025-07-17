const getBaseURL = () => {
    const env = process.env.NODE_ENV;
  
    if (env === "development") {
      return {
        public: process.env.PUBLIC_URL_LOCAL,
        admin: process.env.ADMIN_URL_LOCAL,
      };
    } else {
      return {
        public: process.env.PUBLIC_URL_PROD,
        admin: process.env.ADMIN_URL_PROD,
      };
    }
  };
  
  module.exports = getBaseURL;
  