export const getNotificationEmailTemplate = (subject, message, imageCid) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 15px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#111827; padding:25px; text-align:center;">
              <h2 style="color:#ffffff; margin:0; font-size:22px;">
                ${subject}
              </h2>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:30px;">
              <p style="font-size:15px; color:#444; line-height:1.7;">
                ${message.replace(/\n/g, '<br/>')}
              </p>

              ${imageCid ? `
              <div style="margin-top:20px; text-align:center;">
                <img src="cid:${imageCid}" alt="Notification image" style="max-width:560px; width:100%; height:auto; border-radius:6px;" />
              </div>
              ` : ''}

              <div style="margin-top:30px; text-align:center;">
                <a href="${process.env.APP_URL || '#'}"
                   style="background:#2563eb; color:#ffffff; text-decoration:none;
                          padding:12px 24px; border-radius:6px; font-size:14px;">
                  Learn More
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9; padding:20px; text-align:center; font-size:12px; color:#777;">
              You’re receiving this email because you subscribed to updates.<br/>
              © ${new Date().getFullYear()} Cinema Rwanda
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
