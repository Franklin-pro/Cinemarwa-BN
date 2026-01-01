import axios from "axios";

export const lanariPayConfig = {
  // Full endpoint URLs according to documentation
  processUrl: process.env.LANARI_PAY_PROCESS_URL || "https://www.lanari.rw/lanari_pay/api/payment/process.php",
  statusUrl: process.env.LANARI_PAY_STATUS_URL || "https://www.lanari.rw/lanari_pay/api/payment/status.php",
  balanceUrl: process.env.LANARI_PAY_BALANCE_URL || "https://www.lanari.rw/lanari_pay/api/account/balance.php",
  transactionsUrl: process.env.LANARI_PAY_TRANSACTIONS_URL || "https://www.lanari.rw/lanari_pay/api/account/transactions.php",
  apiKey: process.env.LANARI_PAY_API_KEY,
  apiSecret: process.env.LANARI_PAY_API_SECRET,
};

/**
 * Process payment using Lanari Pay
 * @param {number} amount - Amount to charge (in RWF)
 * @param {string} phoneNumber - Customer phone number
 * @param {string} userId - User ID
 * @param {string} description - Payment description
 * @param {string} currency - Currency code (only RWF supported)
 * @param {Array} payoutNumbers - Array of payout recipients with percentages
 * @returns {Object} Payment result
 */
export const requestToPay = async (amount, phoneNumber, userId, description, currency = "RWF", payoutNumbers = null) => {
  try {
    console.log("🔧 Payment Request Details:", {
      amount,
      phoneNumber,
      userId,
      description,
      currency,
      apiKey: lanariPayConfig.apiKey ? "✅ Set" : "❌ Missing",
      apiSecret: lanariPayConfig.apiSecret ? "✅ Set" : "❌ Missing",
      payoutNumbers,
    });

    // Validate API credentials
    if (!lanariPayConfig.apiKey || !lanariPayConfig.apiSecret) {
      return {
        success: false,
        error: "Lanari Pay API credentials not configured. Please set LANARI_PAY_API_KEY and LANARI_PAY_API_SECRET in environment variables.",
      };
    }

    // Validate currency - Lanari Pay only supports RWF
    if (currency !== "RWF") {
      console.warn(`Currency ${currency} not supported by Lanari Pay, converting to RWF`);
      
      const exchangeRates = {
        USD: 1200,
        EUR: 1300,
        GBP: 1500,
      };
      
      if (exchangeRates[currency]) {
        amount = Math.round(amount * exchangeRates[currency]);
      }
      currency = "RWF";
    }

    // Clean and validate phone number
    let cleanPhone = phoneNumber.replace(/[+\s\-()]/g, '');
    
    console.log("📱 Phone Number Processing:", {
      original: phoneNumber,
      cleaned: cleanPhone,
    });

    // Ensure it's a Rwanda number in correct format
    if (cleanPhone.startsWith('250')) {
      cleanPhone = '0' + cleanPhone.substring(3);
    } else if (!cleanPhone.startsWith('0')) {
      cleanPhone = '0' + cleanPhone;
    }

    // Validate phone number length
    if (cleanPhone.length !== 10) {
      return {
        success: false,
        error: `Invalid phone number format. Expected 10 digits (0XXXXXXXXX), got ${cleanPhone.length} digits: ${cleanPhone}`,
      };
    }

    // Amount should be integer for RWF
    const amountInRwf = Math.round(amount);

    // Validate minimum amount
    if (amountInRwf < 5) {
      return {
        success: false,
        error: `Amount too low. Minimum payment is 100 RWF, got ${amountInRwf} RWF`,
      };
    }

    // Prepare request payload
    const payload = {
      api_key: lanariPayConfig.apiKey,
      api_secret: lanariPayConfig.apiSecret,
      amount: amountInRwf,
      customer_phone: cleanPhone,
      currency: "RWF",
      payment_method: "mobile_money",
      description: description || "Payment",
      customer_email: "",
    };

    // Add payout numbers if provided
    if (payoutNumbers && Array.isArray(payoutNumbers) && payoutNumbers.length > 0) {
      // Validate payout numbers sum to 100%
      const totalPercentage = payoutNumbers.reduce((sum, payout) => sum + payout.percentage, 0);
      
      if (totalPercentage !== 100) {
        console.warn(`⚠️ Payout percentages sum to ${totalPercentage}%, not 100%. Adjusting automatically.`);
        
        // Adjust percentages proportionally to sum to 100%
        const adjustmentFactor = 100 / totalPercentage;
        payload.payout_numbers = payoutNumbers.map(payout => ({
          tel: payout.tel,
          percentage: Math.round(payout.percentage * adjustmentFactor)
        }));
      } else {
        payload.payout_numbers = payoutNumbers;
      }
      
      console.log("💰 Payout Numbers Included:", {
        count: payload.payout_numbers.length,
        percentages: payload.payout_numbers.map(p => `${p.tel}: ${p.percentage}%`),
        totalPercentage: payload.payout_numbers.reduce((sum, p) => sum + p.percentage, 0)
      });
    }

    console.log("📤 Sending Request to Lanari Pay:", {
      url: lanariPayConfig.processUrl,
      payload: {
        ...payload,
        api_key: "***REDACTED***",
        api_secret: "***REDACTED***",
      },
    });

    const response = await axios.post(
      lanariPayConfig.processUrl,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        validateStatus: (status) => status < 500,
      }
    );

    console.log("📱 Lanari Pay API Response:", {
      status: response.status,
      data: response.data,
    });

    const responseData = response.data;
    
    // Check gateway response status
    const gatewayStatus = responseData.gateway_response?.data?.status;
    const isGatewaySuccessful = gatewayStatus === "SUCCESSFUL";
    
    console.log("🔍 Gateway Status:", gatewayStatus);

    // Check if the response indicates success
    const isSuccess = 
      isGatewaySuccessful ||
      responseData.success === true || 
      responseData.status === "success" || 
      (responseData.transaction_ref && responseData.status !== "failed");

    if (isSuccess) {
      return {
        success: true,
        referenceId: 
          responseData.transaction_ref ||
          responseData.transaction_id ||
          responseData.reference_id ||
          responseData.id,
        status: isGatewaySuccessful ? 'success' : (responseData.status || 'pending'),
        gatewayStatus: gatewayStatus,
        isGatewaySuccessful: isGatewaySuccessful,
        message: isGatewaySuccessful 
          ? 'Payment successful' 
          : (responseData.message || 'Payment initiated successfully'),
        data: responseData,
        amount: amountInRwf,
        currency: "RWF",
        phoneNumber: cleanPhone,
        payoutNumbers: payload.payout_numbers || null,
      };
    } else {
      const errorMessage = 
        responseData.message || 
        responseData.error || 
        responseData.gateway_response?.data?.message ||
        'Payment initiation failed';
      
      console.error("❌ Lanari Pay Error Details:", {
        message: errorMessage,
        statusCode: response.status,
        gatewayResponse: responseData.gateway_response,
      });

      return {
        success: false,
        error: errorMessage,
        data: responseData,
        details: {
          message: errorMessage,
          statusCode: response.status,
        },
      };
    }
  } catch (error) {
    console.error("❌ Lanari Pay API Error:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code,
    });
    
    let errorMessage = "Failed to send payment request";
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = "Cannot connect to Lanari Pay API. Please check the API URL.";
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = "Request to Lanari Pay timed out. Please try again.";
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
      statusCode: error.response?.status,
      data: error.response?.data,
      code: error.code,
    };
  }
};
/**
 * Check payment status from Lanari Pay
 */
export const checkPaymentStatus = async (referenceId) => {
  try {
    console.log("🔍 Checking payment status for:", referenceId);

    if (!referenceId) {
      return {
        success: false,
        error: "Reference ID is required",
        status: "ERROR",
      };
    }

    // Option 1: Using GET with query parameters
    const response = await axios.get(
      lanariPayConfig.statusUrl,
      {
        params: {
          transaction_ref: referenceId,
          api_key: lanariPayConfig.apiKey,
          api_secret: lanariPayConfig.apiSecret,
        },
        headers: {
          "Accept": "application/json",
        },
        validateStatus: (status) => status < 500,
      }
    );

    console.log("📊 Status Check Response:", response.data);

    const responseData = response.data;
    
    // Map Lanari Pay status to your application status
    let status = "PENDING";
    if (
      responseData.status === "success" || 
      responseData.status === "completed" ||
      responseData.payment_status === "completed" ||
      responseData.payment_status === "successful"
    ) {
      status = "SUCCESSFUL";
    } else if (
      responseData.status === "failed" || 
      responseData.payment_status === "failed" ||
      responseData.payment_status === "cancelled"
    ) {
      status = "FAILED";
    }

    return {
      success: true,
      status: status,
      transactionId: referenceId,
      amount: responseData.amount,
      currency: responseData.currency || "RWF",
      financialTransactionId: responseData.financial_transaction_id || responseData.momo_transaction_id,
      reason: responseData.reason || responseData.error,
      data: responseData,
    };
  } catch (error) {
    console.error("❌ Status Check Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: "ERROR",
    };
  }
};

/**
 * Send money to recipient via Lanari Pay (Payout/Disbursement)
 * Note: This might require a different API endpoint or separate payout credentials
 */
export const sendMoneyToRecipient = async (amount, phoneNumber, externalId, description) => {
  try {
    console.log("💸 Initiating payout:", {
      amount,
      phoneNumber,
      externalId,
      description,
    });

    if (!lanariPayConfig.apiKey || !lanariPayConfig.apiSecret) {
      console.error("❌ Lanari Pay credentials not configured for payouts");
      return {
        success: false,
        error: "Payout credentials not configured",
      };
    }

    const cleanPhone = phoneNumber.replace(/[+\s\-()]/g, '');
    
    // Ensure Rwanda format
    let formattedPhone = cleanPhone;
    if (cleanPhone.startsWith('0')) {
      formattedPhone = '0' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('0')) {
      formattedPhone = '0' + cleanPhone;
    }

    // Note: Lanari Pay might have a different endpoint for payouts
    // Check with their support for the correct payout/disbursement endpoint
    // Using a placeholder endpoint for now
    const payoutUrl = process.env.LANARI_PAY_PAYOUT_URL || "https://www.lanari.rw/lanari_pay/api/payment/payout.php";
    
    const response = await axios.post(
      payoutUrl,
      {
        api_key: lanariPayConfig.apiKey,
        api_secret: lanariPayConfig.apiSecret,
        amount: Math.round(amount),
        recipient_phone: formattedPhone,
        currency: "RWF",
        payment_method: "mobile_money",
        description: description,
        reference_id: externalId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        validateStatus: (status) => status < 500,
      }
    );

    console.log("💰 Payout Response:", response.data);

    if (response.data.status === "success" || response.data.success === true) {
      return {
        success: true,
        referenceId: response.data.transaction_ref || response.data.transaction_id || response.data.reference_id,
        status: 'SUCCESSFUL',
        message: 'Payout successful',
        data: response.data,
      };
    }

    return {
      success: false,
      error: response.data.message || response.data.error || 'Payout failed',
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Payout Error:", {
      message: error.message,
      response: error.response?.data,
    });
    
    // For now, if payout endpoint doesn't exist, log warning but don't fail
    if (error.response?.status === 404) {
      console.warn("⚠️ Payout endpoint not found. Contact Lanari Pay support for payout/disbursement API.");
      return {
        success: false,
        error: "Payout feature not available. Please contact Lanari Pay support.",
      };
    }
    
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

/**
 * Verify account is active on Lanari Pay
 */
export const verifyAccountActive = async (phoneNumber) => {
  try {
    const cleanPhone = phoneNumber.replace(/[+\s\-()]/g, '');
    
    let formattedPhone = cleanPhone;
    if (cleanPhone.startsWith('0')) {
      formattedPhone = '0' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('0')) {
      formattedPhone = '0' + cleanPhone;
    }
    
    // This endpoint might not exist in Lanari Pay
    // It's optional functionality
    const verifyUrl = process.env.LANARI_PAY_VERIFY_URL || "https://www.lanari.rw/lanari_pay/api/account/verify.php";
    
    const response = await axios.post(
      verifyUrl,
      {
        api_key: lanariPayConfig.apiKey,
        api_secret: lanariPayConfig.apiSecret,
        phone_number: formattedPhone,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        validateStatus: (status) => status < 500,
      }
    );

    return {
      success: true,
      active: response.data.is_active || response.data.verified || false,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Account Verification Error:", error.response?.data || error.message);
    
    // If verification endpoint doesn't exist, assume active
    if (error.response?.status === 404) {
      console.warn("⚠️ Account verification endpoint not available");
      return {
        success: true,
        active: true, // Assume active if verification not available
        error: "Verification endpoint not available",
      };
    }
    
    return {
      success: false,
      active: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

/**
 * Get account balance from Lanari Pay
 */
export const getAccountBalance = async () => {
  try {
    const response = await axios.get(
      lanariPayConfig.balanceUrl,
      {
        headers: {
          "X-API-Key": lanariPayConfig.apiKey,
          "X-API-Secret": lanariPayConfig.apiSecret,
          "Accept": "application/json",
        },
      }
    );

    return {
      success: true,
      balance: response.data.balance,
      currency: response.data.currency || "RWF",
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Balance Check Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

/**
 * Get transaction history from Lanari Pay
 */
export const getTransactions = async (limit = 50, offset = 0, status = null) => {
  try {
    const params = {
      api_key: lanariPayConfig.apiKey,
      api_secret: lanariPayConfig.apiSecret,
      limit,
      offset,
    };

    if (status) {
      params.status = status;
    }

    const response = await axios.get(
      lanariPayConfig.transactionsUrl,
      {
        params,
        headers: {
          "Accept": "application/json",
        },
      }
    );

    return {
      success: true,
      transactions: response.data.transactions || response.data.data || [],
      total: response.data.total || 0,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Get Transactions Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      transactions: [],
    };
  }
};