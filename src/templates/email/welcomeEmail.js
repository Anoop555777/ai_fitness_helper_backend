/**
 * Welcome Email Template
 * 
 * HTML template for welcome emails.
 * 
 * @param {string} appName - Application name
 * @param {string} username - User's username
 * @param {string} frontendUrl - Frontend URL for dashboard link
 * @returns {string} HTML email content
 */
export const generateWelcomeEmailHTML = (appName, username, frontendUrl) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome!</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Welcome to ${appName}!</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${username},</h2>
          <p>Welcome to ${appName}! We're excited to have you on board.</p>
          <p>Get started by:</p>
          <ul>
            <li>Completing your profile</li>
            <li>Exploring available exercises</li>
            <li>Recording your first workout session</li>
          </ul>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${frontendUrl}/dashboard" 
               style="background: #4facfe; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Go to Dashboard
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} ${appName}. All rights reserved.
          </p>
        </div>
      </body>
    </html>
  `;
};

