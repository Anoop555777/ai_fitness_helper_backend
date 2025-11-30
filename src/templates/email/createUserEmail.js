/**
 * Create User Email Template
 * 
 * HTML template for user creation emails.
 * 
 * @param {string} appName - Application name
 * @param {string} email - User's email address
 * @param {string} verificationUrl - Email verification URL (will auto-verify and redirect)
 * @returns {string} HTML email content
 */
export const generateCreateUserEmailHTML = (appName, email, verificationUrl) => {
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
          <p>Thank you for signing up with <strong>${appName}</strong>! Please verify your email and complete your registration by setting up your username and password.</p>
          <p>Click the button below to verify your email and create your account:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Verify Email & Complete Registration
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This link will expire in 24 hours. If you didn't sign up for an account, you can safely ignore this email.
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

