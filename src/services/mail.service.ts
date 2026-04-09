import { Resend } from 'resend';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow('RESEND_API_KEY'));
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
      this.logger.error(`Failed to send password reset email to ${to}`, error);
      throw new InternalServerErrorException(
        'Failed to send password reset email. Please try again.',
      );
    }
  }

  async sendPurchaseReceipt(
    to: string,
    purchase: {
      cookbookTitle: string;
      cookbookImage: string;
      price: number;
      purchaseDate: Date;
    },
  ) {
    try {
      await this.resend.emails.send({
        from: 'Chefalio Support <no-reply@eventifyseu.online>',
        to,
        subject: 'Your Cookbook Purchase Receipt',
        html: `<!-- Preheader (hidden preview text in inbox) -->
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
  Your purchase was successful. Here is your receipt.
</div>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8; padding:40px 0; font-family: Arial, Helvetica, sans-serif;">
  <tr>
    <td align="center">

      <!-- Container -->
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px;">
        <tr>
          <td style="padding:30px; text-align:center;">

            <h2 style="margin:0 0 10px; color:#333;">Thank you for your purchase!</h2>

            <p style="margin:0 0 20px; color:#555; font-size:15px; line-height:1.6;">
              Your purchase has been completed successfully. Here’s your receipt:
            </p>

            <!-- Items table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-top:10px;">
              <tr style="background:#f0f0f0;">
                <th align="left" style="padding:10px; border:1px solid #ddd;">Cookbook</th>
                <th align="left" style="padding:10px; border:1px solid #ddd;">Price</th>
              </tr>

              <tr>
                <td style="padding:10px; border:1px solid #ddd;">
                  <table>
                    <tr>
                      <td>
                        <img 
                          src="${purchase.cookbookImage}" 
                          alt="${purchase.cookbookTitle}" 
                          width="50"
                          style="display:block; border-radius:4px;"
                        />
                      </td>
                      <td style="padding-left:10px; color:#333;">
                        ${purchase.cookbookTitle}
                      </td>
                    </tr>
                  </table>
                </td>

                <td style="padding:10px; border:1px solid #ddd; color:#333;">
                  $${purchase.price.toFixed(2)}
                </td>
              </tr>
            </table>

            <!-- Date -->
            <p style="margin:25px 0 0; font-size:13px; color:#777;">
              Purchase Date: ${purchase.purchaseDate.toDateString()}
            </p>

            <hr style="margin:25px 0; border:none; border-top:1px solid #eee;" />

            <p style="font-size:12px; color:#888; margin:0;">
              If you have any questions, just reply to this email.
            </p>

          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>`,
      });

      console.log(`Purchase receipt sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send purchase receipt to ${to}`, error);
      throw new InternalServerErrorException(
        'Failed to send purchase receipt. Please try again.',
      );
    }
  }
}
