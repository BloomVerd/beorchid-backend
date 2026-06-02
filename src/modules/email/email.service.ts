import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    if (this.configService.get<string>('STAGE') === 'production') {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: this.configService.get<string>('GMAIL_USER'),
          pass: this.configService.get<string>('GMAIL_APP_PASSWORD'),
        },
      });
    } else {
      this.initEthereal();
    }
  }

  private async initEthereal() {
    const testAccount = await nodemailer.createTestAccount();
    this.transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  }

  async sendMagicLink(
    to: string,
    firstName: string,
    link: string,
  ): Promise<void> {
    const html = this.compileTemplate('magic-link', { firstName, link });
    await this.send(to, 'Your magic link to sign in', html);
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    const html = this.compileTemplate('welcome', { firstName });
    await this.send(to, 'Welcome to BeOrchid!', html);
  }

  private compileTemplate(name: string, context: object): string {
    const templatePath = path.join(__dirname, 'templates', `${name}.hbs`);
    const source = fs.readFileSync(templatePath, 'utf-8');
    return handlebars.compile(source)(context);
  }

  private async send(to: string, subject: string, html: string) {
    const info = await this.transporter.sendMail({
      from: this.configService.get<string>('EMAIL_FROM'),
      to,
      subject,
      html,
    });
    console.log('Email sent: %s', info.messageId);
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log('Preview URL: %s', preview);
  }
}
