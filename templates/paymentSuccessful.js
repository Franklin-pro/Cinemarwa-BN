// templates/PaymentEmailTemplate.js
export const getPaymentSuccessfulEmailTemplate = ({
  userName,
  movieTitle,
  amount,
  paymentDate,
  transactionId,
  paymentMethod,
  moviePosterUrl = 'https://images.unsplash.com/photo-1489599809516-9827b6d1cf13?auto=format&fit=crop&w=600&q=80',
  downloadLink,
  watchLink,
  supportEmail = 'support@cinemarwaclouds.com'
}) => {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Confirmation - CinemaRwa</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #2d3748;
        }
        .success-box {
            background: #f0fff4;
            border: 2px solid #68d391;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .success-icon {
            color: #38a169;
            font-size: 48px;
            margin-bottom: 10px;
        }
        .movie-card {
            background: #f7fafc;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            display: flex;
            align-items: center;
            gap: 20px;
        }
        .movie-poster {
            width: 100px;
            height: 140px;
            border-radius: 6px;
            object-fit: cover;
        }
        .movie-info h3 {
            margin: 0 0 10px 0;
            color: #2d3748;
            font-size: 18px;
        }
        .payment-details {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            color: #718096;
        }
        .detail-value {
            color: #2d3748;
            font-weight: 600;
        }
        .amount {
            color: #38a169;
            font-size: 18px;
        }
        .action-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 30px 0;
        }
        .btn {
            display: block;
            padding: 12px 24px;
            text-align: center;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            transition: all 0.3s;
        }
        .btn-primary {
            background: #4299e1;
            color: white;
        }
        .btn-primary:hover {
            background: #3182ce;
        }
        .btn-secondary {
            background: #e2e8f0;
            color: #2d3748;
        }
        .btn-secondary:hover {
            background: #cbd5e0;
        }
        .footer {
            background: #2d3748;
            color: #a0aec0;
            padding: 30px;
            text-align: center;
        }
        .footer-links a {
            color: #a0aec0;
            text-decoration: none;
            margin: 0 10px;
        }
        .footer-links a:hover {
            color: white;
        }
        @media (max-width: 600px) {
            .movie-card {
                flex-direction: column;
                text-align: center;
            }
            .action-buttons {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo">🎬 CinemaRwa</div>
            <div>Your Gateway to Premium Entertainment</div>
        </div>
        
        <div class="content">
            <h1 class="greeting">Hello ${userName},</h1>
            
            <div class="success-box">
                <div class="success-icon">✓</div>
                <h2 style="margin: 0; color: #38a169;">Payment Successful!</h2>
                <p style="color: #4a5568; margin-top: 10px;">
                    Thank you for your purchase. Your transaction has been completed successfully.
                </p>
            </div>
            
            <div class="movie-card">
                <img src="${moviePosterUrl}" alt="${movieTitle}" class="movie-poster">
                <div class="movie-info">
                    <h3>${movieTitle}</h3>
                    <p style="color: #718096; margin: 0;">
                        You now have full access to this premium content
                    </p>
                </div>
            </div>
            
            <div class="payment-details">
                <h3 style="margin-top: 0; color: #2d3748;">Payment Details</h3>
                <div class="detail-row">
                    <span class="detail-label">Amount Paid:</span>
                    <span class="detail-value amount">RWF ${amount}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Payment Date:</span>
                    <span class="detail-value">${paymentDate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction ID:</span>
                    <span class="detail-value">${transactionId}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Payment Method:</span>
                    <span class="detail-value">${paymentMethod}</span>
                </div>
            </div>
            
            ${(watchLink || downloadLink) ? `
            <div class="action-buttons">
                ${watchLink ? `
                <a href="${watchLink}" class="btn btn-primary">
                    🎬 Watch Now
                </a>
                ` : ''}
                
                ${downloadLink ? `
                <a href="${downloadLink}" class="btn btn-secondary">
                    ⬇️ Download
                </a>
                ` : ''}
            </div>
            ` : ''}
            
            <div style="text-align: center; padding: 20px; color: #718096;">
                <p>Need help? Contact our support team at 
                    <a href="mailto:${supportEmail}" style="color: #4299e1;">
                        ${supportEmail}
                    </a>
                </p>
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-links">
                <a href="https://cinemarwa.com">Home</a>
                <a href="https://cinemarwa.com/library">My Library</a>
                <a href="https://cinemarwa.com/help">Help Center</a>
            </div>
            <p style="margin-top: 20px; font-size: 14px;">
                © ${new Date().getFullYear()} CinemaRwa. All rights reserved.<br>
                This is a payment confirmation email for your recent transaction.
            </p>
        </div>
    </div>
</body>
</html>
`;
};

export const getPaymentSuccessfulEmailPlainText = ({
  userName,
  movieTitle,
  amount,
  paymentDate,
  transactionId,
  paymentMethod,
  downloadLink,
  watchLink,
  supportEmail = 'support@cinemarwaclouds.com'
}) => {
  return `
PAYMENT CONFIRMATION - CinemaRwa
================================

Hello ${userName},

Your payment has been successfully processed!

Purchase Details:
-----------------
Movie: ${movieTitle}
Amount: $${amount}
Date: ${paymentDate}
Transaction ID: ${transactionId}
Payment Method: ${paymentMethod}

You can now access "${movieTitle}" in your library.

${watchLink ? `Watch Now: ${watchLink}` : ''}
${downloadLink ? `Download: ${downloadLink}` : ''}

Need assistance?
Contact our support team at: ${supportEmail}

Thank you for choosing CinemaRwa!

Best regards,
The CinemaRwa Team

© ${new Date().getFullYear()} CinemaRwa. All rights reserved.
`;
};