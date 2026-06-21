const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT) || 4174;
const rootDir = __dirname;

const primaryEmail = process.env.PRIMARY_EMAIL || "gandlasandya@gmail.com";
const alternateEmail = process.env.ALTERNATE_EMAIL || "ucsmitra@gmail.com";
const clientWhatsAppNumber = process.env.WHATSAPP_NUMBER || "919912463921";
const maxFieldLength = 1400;
const recentSubmissions = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "18kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    emailConfigured: isEmailConfigured(),
    whatsAppConfigured: isWhatsAppConfigured(),
  });
});

app.post("/api/enquiry", async (req, res) => {
  const rateLimit = checkRateLimit(req.ip);
  if (!rateLimit.ok) {
    return res.status(429).json({
      ok: false,
      message: "Please wait a minute before submitting another enquiry.",
    });
  }

  const enquiry = normalizeEnquiry(req.body);
  const validationError = validateEnquiry(enquiry);
  if (validationError) {
    return res.status(400).json({ ok: false, message: validationError });
  }

  const enquiryText = buildEnquiryText(enquiry);
  const subject = `New Website Enquiry - ${enquiry.name}`;
  const fallback = {
    gmailUrl: buildGmailComposeUrl(subject, enquiryText),
    whatsappUrl: buildWhatsAppUrl(enquiryText),
  };

  const [emailResult, whatsAppResult] = await Promise.all([
    sendEmail({ subject, text: enquiryText, enquiry }),
    sendWhatsApp(enquiryText),
  ]);

  res.json({
    ok: emailResult.sent || whatsAppResult.sent,
    message: buildResponseMessage(emailResult, whatsAppResult),
    email: emailResult,
    whatsapp: whatsAppResult,
    fallback,
  });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.get("/index.html", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.get("/styles.css", (_req, res) => {
  res.type("text/css").sendFile(path.join(rootDir, "styles.css"));
});

app.get("/script.js", (_req, res) => {
  res.type("application/javascript").sendFile(path.join(rootDir, "script.js"));
});

app.use("/assets", express.static(path.join(rootDir, "assets"), {
  immutable: true,
  maxAge: "1d",
}));

app.use((_req, res) => {
  res.status(404).send("Not found");
});

app.listen(port, () => {
  console.log(`Uday Consultancy backend running at http://127.0.0.1:${port}`);
});

function normalizeEnquiry(body = {}) {
  return {
    name: clean(body.name),
    phone: clean(body.phone),
    requirement: clean(body.requirement),
    message: clean(body.message),
    page: clean(body.page),
  };
}

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxFieldLength);
}

function validateEnquiry(enquiry) {
  if (!enquiry.name) return "Name is required.";
  if (!enquiry.phone) return "Phone is required.";
  if (!enquiry.requirement) return "Please select a service.";
  if (enquiry.phone.length < 6) return "Please enter a valid phone number.";
  return "";
}

function buildEnquiryText(enquiry) {
  return [
    "New website enquiry - Uday Consultancy Services",
    "",
    `Name: ${enquiry.name}`,
    `Phone: ${enquiry.phone}`,
    `Requirement: ${enquiry.requirement}`,
    `Message: ${enquiry.message || "Not provided"}`,
    "",
    `Source page: ${enquiry.page || "Website contact form"}`,
  ].join("\n");
}

function buildGmailComposeUrl(subject, body) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: primaryEmail,
    cc: alternateEmail,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function buildWhatsAppUrl(message) {
  return `https://wa.me/${clientWhatsAppNumber}?text=${encodeURIComponent(message)}`;
}

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendEmail({ subject, text, enquiry }) {
  if (!isEmailConfigured()) {
    return { configured: false, sent: false, message: "SMTP credentials are not configured." };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: String(process.env.SMTP_SECURE || "true") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: primaryEmail,
      cc: alternateEmail,
      subject,
      text,
      html: buildEmailHtml(enquiry),
    });

    return { configured: true, sent: true, message: "Email sent to client." };
  } catch (error) {
    console.error("Email send failed:", error.message);
    return { configured: true, sent: false, message: "Email could not be sent." };
  }
}

function buildEmailHtml(enquiry) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#13223a">
      <h2>New website enquiry - Uday Consultancy Services</h2>
      <p><strong>Name:</strong> ${escapeHtml(enquiry.name)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(enquiry.phone)}</p>
      <p><strong>Requirement:</strong> ${escapeHtml(enquiry.requirement)}</p>
      <p><strong>Message:</strong><br>${escapeHtml(enquiry.message || "Not provided")}</p>
      <p><strong>Source page:</strong> ${escapeHtml(enquiry.page || "Website contact form")}</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isWhatsAppConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM &&
    process.env.WHATSAPP_TO
  );
}

async function sendWhatsApp(message) {
  if (!isWhatsAppConfigured()) {
    return { configured: false, sent: false, message: "WhatsApp API credentials are not configured." };
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: formatWhatsAppNumber(process.env.TWILIO_WHATSAPP_FROM),
      To: formatWhatsAppNumber(process.env.WHATSAPP_TO),
      Body: message,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return { configured: true, sent: true, message: "WhatsApp message sent to client." };
  } catch (error) {
    console.error("WhatsApp send failed:", error.message);
    return { configured: true, sent: false, message: "WhatsApp message could not be sent." };
  }
}

function formatWhatsAppNumber(value = "") {
  const raw = String(value).trim();
  return raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`;
}

function buildResponseMessage(emailResult, whatsAppResult) {
  if (emailResult.sent && whatsAppResult.sent) {
    return "Enquiry sent to email and WhatsApp.";
  }
  if (emailResult.sent) {
    return "Enquiry sent to email. WhatsApp fallback is ready.";
  }
  if (whatsAppResult.sent) {
    return "Enquiry sent to WhatsApp. Email fallback is ready.";
  }
  return "Backend received the enquiry. Configure SMTP and WhatsApp API credentials to auto-send.";
}

function checkRateLimit(ip) {
  const now = Date.now();
  const previous = recentSubmissions.get(ip) || 0;
  if (now - previous < 30_000) return { ok: false };
  recentSubmissions.set(ip, now);

  for (const [key, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > 10 * 60_000) recentSubmissions.delete(key);
  }

  return { ok: true };
}
