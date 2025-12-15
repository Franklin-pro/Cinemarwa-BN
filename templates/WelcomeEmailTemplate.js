export const getWelcomeEmailTemplate = (email) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 15px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background:#2563eb; padding:30px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:26px;">
                🎬 Welcome to Our Community
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:30px;">
              <p style="font-size:16px; color:#333; margin-bottom:16px;">
                Hi there 👋,
              </p>

              <p style="font-size:15px; color:#555; line-height:1.6;">
                Thank you for subscribing! You’re now part of an exclusive community where you’ll receive:
              </p>

              <ul style="color:#555; font-size:15px; line-height:1.6; padding-left:20px;">
                <li>Latest updates & announcements</li>
                <li>New content notifications</li>
                <li>Special offers & insights</li>
              </ul>

              <p style="font-size:15px; color:#555; line-height:1.6;">
                We promise to keep emails relevant and valuable.
              </p>

              <!-- CTA -->
              <div style="text-align:center; margin:30px 0;">
                <a href="${process.env.APP_URL || '#'}"
                   style="background:#2563eb; color:#ffffff; text-decoration:none;
                          padding:12px 24px; border-radius:6px; font-size:15px;">
                  Visit Platform
                </a>
              </div>

              <p style="font-size:13px; color:#777;">
                If you didn’t subscribe, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9; padding:20px; text-align:center; font-size:12px; color:#777;">
              © ${new Date().getFullYear()} Cinema Rwanda. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
