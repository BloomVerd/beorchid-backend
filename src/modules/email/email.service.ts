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

  async sendPredictionAlert(
    to: string,
    firstName: string,
    farmName: string,
    summary: string,
  ): Promise<void> {
    const html = this.compileTemplate('prediction-alert', { firstName, farmName, summary });
    await this.send(to, `Prediction Alert — ${farmName}`, html);
  }

  async sendHealthAlert(
    to: string,
    firstName: string,
    farmName: string,
    summary: string,
  ): Promise<void> {
    const html = this.compileTemplate('health-alert', { firstName, farmName, summary });
    await this.send(to, `Health Alert — ${farmName}`, html);
  }

  async sendSubscriptionActivated(
    to: string,
    firstName: string,
    planName: string,
    summary: string,
  ): Promise<void> {
    const html = this.compileTemplate('subscription-activated', { firstName, planName, summary });
    await this.send(to, `Your ${planName} plan is now active`, html);
  }

  async sendSuperAdminCredentials(to: string, firstName: string, email: string, password: string): Promise<void> {
    const html = this.compileTemplate('super-admin-credentials', { firstName, email, password });
    await this.send(to, 'Your BeOrchid Super Admin credentials', html);
  }

  async sendFarmSetupComplete(
    to: string,
    firstName: string,
    farmName: string,
  ): Promise<void> {
    const html = this.compileTemplate('farm-setup-complete', { firstName, farmName });
    await this.send(to, `${farmName} setup is complete`, html);
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
