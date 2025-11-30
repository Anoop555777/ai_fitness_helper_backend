/**
 * Email Service
 *
 * Class-based email service using Nodemailer for sending transactional emails via Gmail SMTP.
 * Supports email verification, password reset, and welcome emails.
 *
 * Gmail Configuration:
 * - Requires Gmail App Password (not regular password)
 * - SMTP: smtp.gmail.com, Port: 587 (TLS) or 465 (SSL)
 *
 * @class EmailService
 *
 * @example
 * const emailService = new EmailService();
 * await emailService.sendVerificationEmail('user@example.com', 'John', 'token123');
 */

import nodemailer from "nodemailer";
import AppError from "../utils/appError.js";
import { logError, logInfo } from "../utils/logger.js";
import { HTTP_STATUS } from "../config/constants.js";
import { generateVerificationEmailHTML } from "../templates/email/verificationEmail.js";
import { generatePasswordResetEmailHTML } from "../templates/email/passwordResetEmail.js";
import { generateWelcomeEmailHTML } from "../templates/email/welcomeEmail.js";
import { generateCreateUserEmailHTML } from "../templates/email/createUserEmail.js";
import { generateResendCreateUserEmailHTML } from "../templates/email/resendCreateUserEmail.js";

// ============================================
// CONFIGURATION
// ============================================

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://asb-ai-fitness-helper.vercel.app";
const APP_NAME = process.env.APP_NAME || "AI Fitness Form Helper";
const FROM_EMAIL = process.env.FROM_EMAIL || GMAIL_USER;
const FROM_NAME = process.env.FROM_NAME || APP_NAME;

// ============================================
// EMAIL SERVICE CLASS
// ============================================

/**
 * EmailService - Class for sending emails via Gmail SMTP using Nodemailer
 */
class EmailService {
  /**
   * Creates an instance of EmailService
   * @param {Object} options - Configuration options (optional, uses env vars if not provided)
   * @param {string} options.user - Gmail address
   * @param {string} options.appPassword - Gmail app password
   */
  constructor(options = {}) {
    const user = options.user || GMAIL_USER;
    const appPassword = options.appPassword || GMAIL_APP_PASSWORD;

    if (!user) {
      logError("Gmail user is not configured", {});
      throw new AppError(
        "Email service is not configured - GMAIL_USER is missing",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }

    if (!appPassword) {
      logError("Gmail app password is not configured", {});
      throw new AppError(
        "Email service is not configured - GMAIL_APP_PASSWORD is missing",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }

    // Configure transporter with app password authentication
    const transporterConfig = {
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: user,
        pass: appPassword,
      },
      tls: {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      },
    };

    this.transporter = nodemailer.createTransport(transporterConfig);
    this.fromEmail = FROM_EMAIL || user;
    this.fromName = FROM_NAME;
    this.frontendUrl = FRONTEND_URL;
    this.appName = APP_NAME;

    // Set up error event handler
    this.transporter.on("error", (error) => {
      logError("Nodemailer transport error", { error: error.message });
    });
  }

  /**
   * Check if email service is configured
   * @returns {boolean}
   */
  static isConfigured() {
    return !!(GMAIL_USER && GMAIL_APP_PASSWORD);
  }

  /**
   * Verify SMTP connection
   * @returns {Promise<boolean>}
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      logInfo("SMTP connection verified successfully", {});
      return true;
    } catch (error) {
      logError("SMTP connection verification failed", {
        error: error.message,
        code: error.code,
      });
      throw new AppError(
        `SMTP connection failed: ${error.message}`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Send email with retry logic and error handling
   * @private
   * @param {Object} emailOptions - Email options
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @returns {Promise<Object>} Email result with messageId or error
   */
  async _sendEmail(emailOptions, maxRetries = 3) {
    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: emailOptions.to,
      subject: emailOptions.subject,
      text: emailOptions.text,
      html: emailOptions.html,
    };

    // Add optional fields
    if (emailOptions.cc) mailOptions.cc = emailOptions.cc;
    if (emailOptions.bcc) mailOptions.bcc = emailOptions.bcc;
    if (emailOptions.replyTo) mailOptions.replyTo = emailOptions.replyTo;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const info = await this.transporter.sendMail(mailOptions);

        // Success
        logInfo("Email sent successfully", {
          messageId: info.messageId,
          to: emailOptions.to,
          subject: emailOptions.subject,
          accepted: info.accepted,
          attempt,
        });

        return {
          success: true,
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        };
      } catch (error) {
        // Handle specific error types
        const errorCode = error.code;
        const errorMessage = error.message || "Unknown error";

        // Connection errors - retry
        if (
          errorCode === "ECONNREFUSED" ||
          errorCode === "ETIMEDOUT" ||
          errorCode === "ECONNRESET"
        ) {
          if (attempt < maxRetries) {
            const delay = 1000 * attempt;
            logError(
              `Email send attempt ${attempt} failed (connection error), retrying in ${delay}ms...`,
              {
                errorCode,
                errorMessage,
                to: emailOptions.to,
              }
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        // Authentication errors - don't retry
        if (errorCode === "EAUTH" || errorCode === "EENVELOPE") {
          logError("Email authentication error", {
            errorCode,
            errorMessage,
            to: emailOptions.to,
          });
          throw new AppError(
            `Email authentication failed: ${errorMessage}. Please check your Gmail credentials.`,
            HTTP_STATUS.INTERNAL_SERVER_ERROR
          );
        }

        // TLS/SSL errors - don't retry
        if (errorCode === "ETLS" || errorCode === "ESOCKET") {
          logError("Email TLS/SSL error", {
            errorCode,
            errorMessage,
            to: emailOptions.to,
          });
          throw new AppError(
            `Email connection error: ${errorMessage}`,
            HTTP_STATUS.INTERNAL_SERVER_ERROR
          );
        }

        // Rejected recipients - don't retry
        if (error.rejected && error.rejected.length > 0) {
          logError("Email rejected by server", {
            rejected: error.rejected,
            to: emailOptions.to,
            response: error.response,
          });
          throw new AppError(
            `Email rejected: ${errorMessage}`,
            HTTP_STATUS.BAD_REQUEST
          );
        }

        // Other errors - retry if attempts remain
        if (attempt < maxRetries) {
          const delay = 1000 * attempt;
          logError(
            `Email send attempt ${attempt} failed, retrying in ${delay}ms...`,
            {
              errorCode,
              errorMessage,
              to: emailOptions.to,
            }
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Final failure after all retries
        logError("Email send failed after all retries", {
          errorCode,
          errorMessage,
          to: emailOptions.to,
          subject: emailOptions.subject,
          totalAttempts: attempt,
        });
        throw new AppError(
          `Failed to send email after ${maxRetries} attempts: ${errorMessage}`,
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
      }
    }
  }

  /**
   * Generate plain text from HTML
   * @private
   * @param {string} html - HTML content
   * @returns {string} Plain text content
   */
  _htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/\n\s*\n/g, "\n")
      .trim();
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Send email verification email
   * @param {string} email - User's email address
   * @param {string} username - User's username
   * @param {string} verificationToken - Verification token (unhashed)
   * @returns {Promise<Object>} Email result
   *
   * @example
   * await emailService.sendVerificationEmail('user@example.com', 'John', 'token123');
   */
  async sendVerificationEmail(email, username, verificationToken) {
    const verificationUrl = `${this.frontendUrl}/verify-email/${verificationToken}`;
    const subject = `Verify Your Email - ${this.appName}`;
    const html = generateVerificationEmailHTML(
      this.appName,
      username,
      verificationUrl
    );
    const text = this._htmlToText(html);

    return await this._sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send password reset email
   * @param {string} email - User's email address
   * @param {string} username - User's username
   * @param {string} resetToken - Password reset token (unhashed)
   * @returns {Promise<Object>} Email result
   *
   * @example
   * await emailService.sendPasswordResetEmail('user@example.com', 'John', 'token123');
   */
  async sendPasswordResetEmail(email, username, resetToken) {
    const resetUrl = `${this.frontendUrl}/reset-password/${resetToken}`;
    const subject = `Reset Your Password - ${this.appName}`;
    const html = generatePasswordResetEmailHTML(
      this.appName,
      username,
      resetUrl
    );
    const text = this._htmlToText(html);

    return await this._sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send create user email (for initial registration)
   * @param {string} email - User's email address
   * @param {string} verificationToken - Token for verifying email and creating user account
   * @returns {Promise<Object>} Email result
   *
   * @example
   * await emailService.sendCreateUserEmail('user@example.com', 'token123');
   */
  async sendCreateUserEmail(
    email,
    verificationToken,
    directToFrontend = false
  ) {
    // If directToFrontend is true, link goes directly to frontend create-user page
    // Otherwise, link goes to backend verify-token endpoint which creates user and redirects to frontend
    const verificationUrl = directToFrontend
      ? `${this.frontendUrl}/create-user?token=${verificationToken}`
      : `${
          process.env.BACKEND_URL || "http://localhost:8000"
        }/api/v1/auth/verify-token/${verificationToken}`;
    const subject = `Complete Your Registration - ${this.appName}`;
    const html = generateCreateUserEmailHTML(
      this.appName,
      email,
      verificationUrl
    );
    const text = this._htmlToText(html);

    return await this._sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send resend create user email (for inactive users who need to complete registration)
   * @param {string} email - User's email address
   * @param {string} verificationToken - Token for completing user account creation
   * @returns {Promise<Object>} Email result
   *
   * @example
   * await emailService.sendResendCreateUserEmail('user@example.com', 'token123');
   */
  async sendResendCreateUserEmail(email, verificationToken) {
    // Link goes directly to frontend create-user page (user already exists, just needs to complete registration)
    const createUserUrl = `${this.frontendUrl}/create-user?token=${verificationToken}`;
    const subject = `Complete Your Registration - ${this.appName}`;
    const html = generateResendCreateUserEmailHTML(
      this.appName,
      email,
      createUserUrl
    );
    const text = this._htmlToText(html);

    return await this._sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send welcome email
   * @param {string} email - User's email address
   * @param {string} username - User's username
   * @returns {Promise<Object>} Email result
   *
   * @example
   * await emailService.sendWelcomeEmail('user@example.com', 'John');
   */
  async sendWelcomeEmail(email, username) {
    const subject = `Welcome to ${this.appName}!`;
    const html = generateWelcomeEmailHTML(
      this.appName,
      username,
      this.frontendUrl
    );
    const text = this._htmlToText(html);

    return await this._sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send custom email
   * @param {Object} options - Email options
   * @param {string|string[]} options.to - Recipient email(s)
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} [options.text] - Plain text content (optional, auto-generated from HTML)
   * @param {string|string[]} [options.cc] - CC recipients (optional)
   * @param {string|string[]} [options.bcc] - BCC recipients (optional)
   * @param {string} [options.replyTo] - Reply-to address (optional)
   * @returns {Promise<Object>} Email result
   *
   * @example
   * await emailService.sendCustomEmail({
   *   to: 'user@example.com',
   *   subject: 'Custom Email',
   *   html: '<h1>Hello</h1><p>This is a custom email.</p>'
   * });
   */
  async sendCustomEmail({ to, subject, html, text, cc, bcc, replyTo }) {
    const emailOptions = {
      to,
      subject,
      html,
      text: text || this._htmlToText(html),
    };

    if (cc) emailOptions.cc = cc;
    if (bcc) emailOptions.bcc = bcc;
    if (replyTo) emailOptions.replyTo = replyTo;

    return await this._sendEmail(emailOptions);
  }

  /**
   * Close transporter connections (useful for cleanup)
   * @returns {Promise<void>}
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
      logInfo("Email transporter closed", {});
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

// Create and export a singleton instance
let emailServiceInstance = null;

/**
 * Get or create the email service instance
 * @returns {EmailService} Email service instance
 */
export const getEmailService = () => {
  if (!emailServiceInstance) {
    if (!EmailService.isConfigured()) {
      logError(
        "Email service not configured - Gmail credentials are missing",
        {}
      );
      return null;
    }
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
};

// Export the class for custom instances
export { EmailService };

// Export convenience functions
export const sendVerificationEmail = async (
  email,
  username,
  verificationToken
) => {
  const service = getEmailService();
  if (!service) {
    throw new AppError(
      "Email service is not configured",
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
  return await service.sendVerificationEmail(
    email,
    username,
    verificationToken
  );
};

export const sendPasswordResetEmail = async (email, username, resetToken) => {
  const service = getEmailService();
  if (!service) {
    throw new AppError(
      "Email service is not configured",
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
  return await service.sendPasswordResetEmail(email, username, resetToken);
};

export const sendCreateUserEmail = async (
  email,
  createUserToken,
  directToFrontend = false
) => {
  const service = getEmailService();
  if (!service) {
    throw new AppError(
      "Email service is not configured",
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
  return await service.sendCreateUserEmail(
    email,
    createUserToken,
    directToFrontend
  );
};

export const sendResendCreateUserEmail = async (email, verificationToken) => {
  const service = getEmailService();
  if (!service) {
    throw new AppError(
      "Email service is not configured",
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
  return await service.sendResendCreateUserEmail(email, verificationToken);
};

export const sendWelcomeEmail = async (email, username) => {
  const service = getEmailService();
  if (!service) {
    throw new AppError(
      "Email service is not configured",
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
  return await service.sendWelcomeEmail(email, username);
};

export default getEmailService;
