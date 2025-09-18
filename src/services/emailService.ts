import nodemailer from 'nodemailer';
import { config } from '../config/environment';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.EMAIL_HOST,
      port: config.EMAIL_PORT,
      secure: config.EMAIL_SECURE,
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Verify connection on startup
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      console.log('✅ Email service connected successfully');
    } catch (error) {
      console.error('❌ Email service connection failed:', error);
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: {
          name: 'Mariposa Scalping Bot',
          address: config.EMAIL_USER
        },
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Email sent successfully to ${options.to}: ${result.messageId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }
  }

  async sendOTPEmail(email: string, otpCode: string, userName?: string): Promise<boolean> {
    const subject = 'Your Mariposa Bot Verification Code';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f7f7f7; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; }
          .otp-code { background-color: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; text-align: center; padding: 20px; margin: 20px 0; font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
          .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🦋 Mariposa Scalping Bot</h1>
            <p>Email Verification Required</p>
          </div>

          <div class="content">
            <h2>Hello${userName ? ` ${userName}` : ''}!</h2>

            <p>To complete your account verification, please enter the following 6-digit code:</p>

            <div class="otp-code">${otpCode}</div>

            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul>
                <li>This code expires in <strong>10 minutes</strong></li>
                <li>Never share this code with anyone</li>
                <li>If you didn't request this code, please ignore this email</li>
              </ul>
            </div>

            <p>If you're having trouble, contact our support team.</p>

            <p>Best regards,<br>
            <strong>Mariposa Bot Team</strong></p>
          </div>

          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 Mariposa Scalping Bot. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject,
      html
    });
  }

  async sendWelcomeEmail(email: string, userName?: string): Promise<boolean> {
    const subject = 'Welcome to Mariposa Scalping Bot!';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f7f7f7; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; }
          .feature { background-color: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #667eea; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🦋 Welcome to Mariposa!</h1>
            <p>Your AI-Powered Scalping Bot is Ready</p>
          </div>

          <div class="content">
            <h2>Hello${userName ? ` ${userName}` : ''}!</h2>

            <p>Welcome to Mariposa Scalping Bot! Your account has been successfully verified and activated.</p>

            <div class="feature">
              <h3>🚀 Getting Started</h3>
              <p>Configure your OKX API credentials to start trading with your personalized scalping agents.</p>
            </div>

            <div class="feature">
              <h3>🤖 AI Analysis</h3>
              <p>Our 4 AI models analyze market data 24/7 to identify profitable scalping opportunities.</p>
            </div>

            <div class="feature">
              <h3>📊 Real-time Monitoring</h3>
              <p>Track your agents' performance with live updates and comprehensive analytics.</p>
            </div>

            <div style="text-align: center;">
              <a href="${config.FRONTEND_URL || 'http://localhost:3000'}/dashboard" class="button">
                Access Your Dashboard
              </a>
            </div>

            <p>If you have any questions, our support team is here to help.</p>

            <p>Happy Trading!<br>
            <strong>The Mariposa Team</strong></p>
          </div>

          <div class="footer">
            <p>© 2024 Mariposa Scalping Bot. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject,
      html
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
    const resetUrl = `${config.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    const subject = 'Reset Your Mariposa Bot Password';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f7f7f7; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; }
          .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset</h1>
            <p>Mariposa Scalping Bot</p>
          </div>

          <div class="content">
            <h2>Password Reset Request</h2>

            <p>You requested a password reset for your Mariposa Bot account.</p>

            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </div>

            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul>
                <li>This link expires in <strong>1 hour</strong></li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Your password won't be changed until you click the link above</li>
              </ul>
            </div>

            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
          </div>

          <div class="footer">
            <p>© 2024 Mariposa Scalping Bot. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject,
      html
    });
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  // Test email functionality
  async sendTestEmail(to: string): Promise<boolean> {
    return await this.sendEmail({
      to,
      subject: 'Mariposa Bot - Email Service Test',
      html: '<h2>🦋 Email Service Working!</h2><p>This is a test email from Mariposa Scalping Bot.</p>'
    });
  }
}

export const emailService = new EmailService();