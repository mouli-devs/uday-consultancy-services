# Uday Consultancy Services Free Hosting Setup

This version is prepared for Netlify Free + Supabase Free.

## What Hosts What

- Netlify hosts the website.
- Netlify Functions handle `/api/*`.
- Supabase stores public updates and uploaded photos/videos.
- Gmail SMTP can send enquiry emails.
- WhatsApp uses a visitor-ready WhatsApp compose link.

## Supabase SQL

Run this in Supabase SQL Editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.updates (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('text', 'photo', 'video')),
  title text not null,
  body text,
  media_url text,
  media_type text,
  created_at timestamptz not null default now()
);

alter table public.updates enable row level security;

create policy "Public can read updates"
on public.updates
for select
using (true);
```

## Supabase Storage

Create a public bucket:

```text
updates-media
```

## Netlify Deploy

Import this GitHub repo into Netlify as a normal site.

Use:

```text
Build command: npm install
Publish directory: public
```

The `netlify.toml` file routes `/api/*` to Netlify Functions.

## Netlify Environment Variables

Add these in Netlify site settings:

```text
ADMIN_PASSWORD=5468
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-secret-key
SUPABASE_BUCKET=updates-media
UPDATE_UPLOAD_LIMIT_MB=8
PRIMARY_EMAIL=gandlasandya@gmail.com
ALTERNATE_EMAIL=ucsmitra@gmail.com
WHATSAPP_NUMBER=919912463921
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-sender-gmail@gmail.com
SMTP_PASS=your-gmail-app-password
MAIL_FROM=Uday Consultancy Services <your-sender-gmail@gmail.com>
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in GitHub or public frontend code.

## Admin Pages

Public updates page:

```text
https://your-netlify-domain.netlify.app/updates.html
```

Hidden admin page:

```text
https://your-netlify-domain.netlify.app/admin-updates.html
```

Normal viewers do not see the admin page. The invisible top-right trigger on the website still opens it after four clicks. Admin password is controlled by `ADMIN_PASSWORD`.

## Free Hosting Note

Netlify Functions are not ideal for very large videos. Keep uploaded videos short/compressed. Photos and small video clips are the safe free-tier use case.
