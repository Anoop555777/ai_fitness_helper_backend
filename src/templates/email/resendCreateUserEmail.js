/**
 * Resend Create User Email Template
 * 
 * HTML template for resending user creation emails (for inactive users).
 * 
 * @param {string} appName - Application name
 * @param {string} email - User's email address
 * @param {string} createUserUrl - Direct link to frontend create-user page with token
 * @returns {string} HTML email content
 */
export const generateResendCreateUserEmailHTML = (appName, email, createUserUrl) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Complete Your Registration</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">${appName}</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Complete Your Registration</h2>
          <p>Hi,</p>
          <p>We noticed you started creating an account with <strong>${appName}</strong> but didn't complete the registration process.</p>
          <p>Click the button below to complete your registration by setting up your username and password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${createUserUrl}" 
               style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Complete Registration
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${createUserUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This link will expire in 24 hours. If you didn't request this email, you can safely ignore it.
          </p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} ${appName}. All rights reserved.
          </p>
        </div>
      </body>
    </html>
  `;
};

