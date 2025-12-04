import axios from "axios";

export const momoConfig = {
  baseUrl: process.env.MOMO_BASE_URL, // e.g. https://sandbox.momodeveloper.mtn.com
  apiUser: process.env.MOMO_API_USER,
  apiKey: process.env.MOMO_API_KEY,
  subscriptionKey: process.env.MOMO_SUBSCRIPTION_KEY,
  collectionUrl: "/collection/v1_0/requesttopay",
  tokenUrl: "/collection/token/",
};

export const getMomoToken = async () => {
  try {
    const response = await axios.post(
      `${momoConfig.baseUrl}${momoConfig.tokenUrl}`,
      {},
      {
        auth: {
          username: momoConfig.apiUser,
          password: momoConfig.apiKey,
        },
        headers: {
          "Ocp-Apim-Subscription-Key": momoConfig.subscriptionKey,
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error("❌ Error getting MoMo token:", error.response?.data || error);
    throw new Error("Failed to get MoMo token");
  }
};
