# Uday Consultancy Services Backend Setup

## Local Run

```powershell
npm install
npm start
```

Open:

```text
http://127.0.0.1:4174/
```

## Render Deploy

Create a **Web Service** on Render, not a Static Site.

Use:

```text
Build Command: npm install
Start Command: npm start
```

For weekly photo/video updates, use a paid Render Web Service with a Render Disk or another persistent storage provider.
Without persistent storage, uploaded updates can disappear after a Render redeploy or restart.

Recommended Render settings:

```text
Service Name: ucs-mitra
Instance Type: Starter
```

Recommended Render Disk:

```text
Mount Path: /opt/render/project/src/data
Size: 1 GB or more
```

Admin posting page:

```text
https://your-render-domain/admin-updates.html
```

Public updates page:

```text
https://your-render-domain/updates.html
```

## Required Environment Variables

Basic contact targets:

```text
PRIMARY_EMAIL=gandlasandya@gmail.com
ALTERNATE_EMAIL=ucsmitra@gmail.com
WHATSAPP_NUMBER=919912463921
ADMIN_PASSWORD=5468
DATA_DIR=/opt/render/project/src/data
UPLOAD_DIR=/opt/render/project/src/data/uploads
UPDATE_UPLOAD_LIMIT_MB=80
```

Email auto-send through Gmail SMTP:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-sender-gmail@gmail.com
SMTP_PASS=your-gmail-app-password
MAIL_FROM=Uday Consultancy Services <your-sender-gmail@gmail.com>
```

WhatsApp auto-send through Twilio WhatsApp:

```text
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=+14155238886
WHATSAPP_TO=+919912463921
```

WhatsApp auto-send requires an approved WhatsApp API sender. Without it, the website still prepares a WhatsApp message link for the visitor to send manually.
