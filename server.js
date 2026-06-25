const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
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
const adminSessions = new Map();
const adminPassword = process.env.ADMIN_PASSWORD || "5468";
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const uploadsDir = path.resolve(rootDir, process.env.UPLOAD_DIR || "uploads");
const updatesFile = path.join(dataDir, "updates.json");
const uploadLimitMb = Number(process.env.UPDATE_UPLOAD_LIMIT_MB) || 80;

ensureStorage();

const updateUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  }),
  limits: {
    fileSize: uploadLimitMb * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only photo and video uploads are allowed."));
  },
});

app.disable("x-powered-by");
app.use(express.json({ limit: "18kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    emailConfigured: isEmailConfigured(),
    whatsAppConfigured: isWhatsAppConfigured(),
    updatesEnabled: true,
    adminPasswordConfigured: Boolean(adminPassword),
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

app.get("/api/updates", (_req, res) => {
  res.json({
    ok: true,
    updates: readUpdates(),
  });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body?.password || "");
  if (!adminPassword) {
    return res.status(503).json({
      ok: false,
      message: "Admin password is not configured on the server.",
    });
  }

  if (!safeCompare(password, adminPassword)) {
    return res.status(401).json({
      ok: false,
      message: "Incorrect password.",
    });
  }

  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
  res.json({ ok: true, token });
});

app.get("/api/admin/session", requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/admin/updates", requireAdmin, updateUpload.single("media"), (req, res) => {
  const update = normalizeUpdate(req.body, req.file);
  const validationError = validateUpdate(update);
  if (validationError) {
    removeUploadedFile(req.file);
    return res.status(400).json({ ok: false, message: validationError });
  }

  const updates = readUpdates();
  updates.unshift(update);
  writeUpdates(updates.slice(0, 80));

  res.json({
    ok: true,
    message: "Update posted successfully.",
    update,
  });
});

app.delete("/api/admin/updates/:id", requireAdmin, (req, res) => {
  const updates = readUpdates();
  const target = updates.find((item) => item.id === req.params.id);
  if (!target) return res.status(404).json({ ok: false, message: "Update not found." });

  writeUpdates(updates.filter((item) => item.id !== req.params.id));
  if (target.mediaUrl) {
    removeUploadedFileByUrl(target.mediaUrl);
  }

  res.json({ ok: true, message: "Update deleted." });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.get("/index.html", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.get(["/updates", "/updates.html"], (_req, res) => {
  res.sendFile(path.join(rootDir, "updates.html"));
});

app.get(["/admin-updates", "/admin-updates.html"], (_req, res) => {
  res.sendFile(path.join(rootDir, "admin-updates.html"));
});

app.get("/styles.css", (_req, res) => {
  res.type("text/css").sendFile(path.join(rootDir, "styles.css"));
});

app.get("/script.js", (_req, res) => {
  res.type("application/javascript").sendFile(path.join(rootDir, "script.js"));
});

app.get("/updates.js", (_req, res) => {
  res.type("application/javascript").sendFile(path.join(rootDir, "updates.js"));
});

app.get("/admin-updates.js", (_req, res) => {
  res.type("application/javascript").sendFile(path.join(rootDir, "admin-updates.js"));
});

app.use("/assets", express.static(path.join(rootDir, "assets"), {
  immutable: true,
  maxAge: "1d",
}));

app.use("/uploads", express.static(uploadsDir, {
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

function ensureStorage() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(updatesFile)) {
    fs.writeFileSync(updatesFile, "[]\n");
  }
}

function readUpdates() {
  try {
    const parsed = JSON.parse(fs.readFileSync(updatesFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeUpdates(updates) {
  fs.writeFileSync(updatesFile, `${JSON.stringify(updates, null, 2)}\n`);
}

function requireAdmin(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expiresAt = adminSessions.get(token);
  if (!token || !expiresAt || expiresAt < Date.now()) {
    if (token) adminSessions.delete(token);
    return res.status(401).json({ ok: false, message: "Admin login required." });
  }
  next();
}

function safeCompare(value, expected) {
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeUpdate(body = {}, file) {
  const type = cleanUpdateField(body.type || "text", 24).toLowerCase();
  const now = new Date();
  const update = {
    id: crypto.randomUUID(),
    type,
    title: cleanUpdateField(body.title, 120),
    body: cleanUpdateField(body.body, 2200),
    createdAt: now.toISOString(),
    displayDate: now.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  };

  if (file) {
    update.mediaUrl = `/uploads/${file.filename}`;
    update.mediaType = file.mimetype.startsWith("video/") ? "video" : "photo";
    update.originalFileName = cleanUpdateField(file.originalname, 180);
  }

  return update;
}

function cleanUpdateField(value, limit) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function validateUpdate(update) {
  if (!["text", "photo", "video"].includes(update.type)) return "Choose text, photo, or video.";
  if (!update.title) return "Title is required.";
  if (!update.body && !update.mediaUrl) return "Add text, photo, or video content.";
  if (update.type === "photo" && update.mediaType !== "photo") return "Please upload a photo.";
  if (update.type === "video" && update.mediaType !== "video") return "Please upload a video.";
  return "";
}

function removeUploadedFile(file) {
  if (file?.path) {
    fs.rm(file.path, { force: true }, () => {});
  }
}

function removeUploadedFileByUrl(mediaUrl) {
  const filename = path.basename(mediaUrl);
  if (!filename) return;
  fs.rm(path.join(uploadsDir, filename), { force: true }, () => {});
}
