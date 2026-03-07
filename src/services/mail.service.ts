import { Resend } from 'resend';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendMail(to: string, token: string) {
    const resetLink = `${process.env.RESET_PASSWORD_URL}?token=${token}`;

    try {
      await this.resend.emails.send({
        from: 'Chefalio Support <no-reply@eventifyseu.online>',
        to,
        subject: 'Password Reset Instructions',
        html: `
<div style="font-family: Arial, Helvetica, sans-serif; background-color:#f4f6f8; padding:40px 0;">
  <div style="max-width:600px; margin:auto; background:#ffffff; padding:30px; border-radius:8px; text-align:center; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
    
    <h2 style="color:#333; margin-bottom:10px;">Reset Your Password</h2>

    <p style="color:#555; font-size:16px; line-height:1.6;">
      You requested to reset your password. Click the button below to create a new password.
    </p>

    <a href="${resetLink}"
       style="display:inline-block; margin-top:20px; padding:12px 24px; 
       background-color:#2563eb; color:#ffffff; text-decoration:none; 
       border-radius:6px; font-weight:bold; font-size:15px;">
       Reset Password
    </a>

    <p style="margin-top:25px; font-size:14px; color:#666;">
      Or copy and paste this link into your browser:
    </p>

    <p style="word-break:break-all; font-size:14px;">
      <a href="${resetLink}" 
         style="color:#2563eb;">
         ${resetLink}
      </a>
    </p>

    <hr style="margin:30px 0; border:none; border-top:1px solid #eee;">

    <p style="font-size:13px; color:#888;">
      If you did not request a password reset, you can safely ignore this email.
    </p>

  </div>
</div>
        `,
      });

      console.log(`Email sent to ${to}`);
    } catch (error) {
      console.error(`Failed to send email to ${to}:`, error);
    }
  }
}
