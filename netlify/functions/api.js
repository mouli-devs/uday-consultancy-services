const crypto = require("crypto");
const path = require("path");
const Busboy = require("busboy");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const primaryEmail = process.env.PRIMARY_EMAIL || "gandlasandya@gmail.com";
const alternateEmail = process.env.ALTERNATE_EMAIL || "ucsmitra@gmail.com";
const clientWhatsAppNumber = process.env.WHATSAPP_NUMBER || "919912463921";
const adminPassword = process.env.ADMIN_PASSWORD || "5468";
const bucketName = process.env.SUPABASE_BUCKET || "updates-media";
const maxFieldLength = 1400;
const uploadLimitMb = Number(process.env.UPDATE_UPLOAD_LIMIT_MB) || 8;
const recentSubmissions = new Map();

exports.handler = async (event) => {
  try {
    const route = getRoute(event);
    const method = event.httpMethod;

    if (method === "GET" && route === "/health") return json(200, health());
    if (method === "POST" && route === "/enquiry") return handleEnquiry(event);
    if (method === "GET" && route === "/updates") return handleReadUpdates();
    if (method === "POST" && route === "/admin/login") return handleAdminLogin(event);
    if (method === "GET" && route === "/admin/session") return handleAdminSession(event);
    if (method === "POST" && route === "/admin/updates") return handleCreateUpdate(event);
    if (method === "DELETE" && route.startsWith("/admin/updates/")) {
      return handleDeleteUpdate(event, route.split("/").pop());
    }

    return json(404, { ok: false, message: "Not found." });
  } catch (error) {
    return json(500, { ok: false, message: error.message || "Server error." });
  }
};

function getRoute(event) {
  const pathValue = event.path || "";
  return pathValue
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "") || "/";
}

function health() {
  return {
    ok: true,
    emailConfigured: isEmailConfigured(),
    whatsAppConfigured: isWhatsAppConfigured(),
    updatesEnabled: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    adminPasswordConfigured: Boolean(adminPassword),
  };
}

async function handleEnquiry(event) {
  const rateLimit = checkRateLimit(event.headers["client-ip"] || event.headers["x-forwarded-for"] || "visitor");
  if (!rateLimit.ok) {
    return json(429, { ok: false, message: "Please wait a minute before submitting another enquiry." });
  }

  const enquiry = normalizeEnquiry(parseJson(event));
  const validationError = validateEnquiry(enquiry);
  if (validationError) return json(400, { ok: false, message: validationError });

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

  return json(200, {
    ok: emailResult.sent || whatsAppResult.sent,
    message: buildResponseMessage(emailResult, whatsAppResult),
    email: emailResult,
    whatsapp: whatsAppResult,
    fallback,
  });
}

async function handleReadUpdates() {
  const { data, error } = await supabase()
    .from("updates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return json(500, { ok: false, message: error.message });
  return json(200, { ok: true, updates: (data || []).map(formatUpdate) });
}

function handleAdminLogin(event) {
  const password = String(parseJson(event).password || "");
  if (!adminPassword) return json(503, { ok: false, message: "Admin password is not configured." });
  if (!safeCompare(password, adminPassword)) return json(401, { ok: false, message: "Incorrect password." });
  return json(200, { ok: true, token: createAdminToken() });
}

function handleAdminSession(event) {
  const auth = requireAdmin(event);
  if (!auth.ok) return json(auth.status, { ok: false, message: auth.message });
  return json(200, { ok: true });
}

async function handleCreateUpdate(event) {
  const auth = requireAdmin(event);
  if (!auth.ok) return json(auth.status, { ok: false, message: auth.message });

  const form = await parseMultipart(event);
  const update = normalizeUpdate(form.fields, form.file);
  const validationError = validateUpdate(update);
  if (validationError) return json(400, { ok: false, message: validationError });

  let mediaUrl = "";
  let mediaType = "";
  if (form.file) {
    const upload = await uploadMedia(form.file);
    mediaUrl = upload.mediaUrl;
    mediaType = update.type;
  }

  const { data, error } = await supabase()
    .from("updates")
    .insert({
      type: update.type,
      title: update.title,
      body: update.body,
      media_url: mediaUrl,
      media_type: mediaType,
    })
    .select("*")
    .single();

  if (error) return json(500, { ok: false, message: error.message });
  return json(200, { ok: true, message: "Update posted successfully.", update: formatUpdate(data) });
}

async function handleDeleteUpdate(event, id) {
  const auth = requireAdmin(event);
  if (!auth.ok) return json(auth.status, { ok: false, message: auth.message });

  const { data: target, error: readError } = await supabase()
    .from("updates")
    .select("*")
    .eq("id", id)
    .single();
  if (readError || !target) return json(404, { ok: false, message: "Update not found." });

  const { error } = await supabase().from("updates").delete().eq("id", id);
  if (error) return json(500, { ok: false, message: error.message });

  await removeMedia(target.media_url);
  return json(200, { ok: true, message: "Update deleted." });
}

function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function parseJson(event) {
  if (!event.body) return {};
  return JSON.parse(event.body);
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType) return reject(new Error("Missing form content type."));

    const fields = {};
    let file = null;
    const busboy = Busboy({ headers: { "content-type": contentType }, limits: { fileSize: uploadLimitMb * 1024 * 1024 } });

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      if (name !== "media" || !info.filename) {
        stream.resume();
        return;
      }

      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("limit", () => reject(new Error(`Upload must be ${uploadLimitMb} MB or smaller.`)));
      stream.on("end", () => {
        file = {
          buffer: Buffer.concat(chunks),
          filename: info.filename,
          mimetype: info.mimeType,
        };
      });
    });

    busboy.on("error", reject);
    busboy.on("finish", () => resolve({ fields, file }));
    busboy.end(Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8"));
  });
}

async function uploadMedia(file) {
  if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("video/")) {
    throw new Error("Only photo and video uploads are allowed.");
  }

  const ext = path.extname(file.filename || "").toLowerCase() || guessExtension(file.mimetype);
  const key = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const storage = supabase().storage.from(bucketName);
  const { error } = await storage.upload(key, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = storage.getPublicUrl(key);
  return { mediaUrl: data.publicUrl };
}

async function removeMedia(mediaUrl) {
  if (!mediaUrl || !mediaUrl.includes(`/storage/v1/object/public/${bucketName}/`)) return;
  const key = decodeURIComponent(mediaUrl.split(`/storage/v1/object/public/${bucketName}/`)[1] || "");
  if (key) await supabase().storage.from(bucketName).remove([key]);
}

function normalizeUpdate(fields = {}, file) {
  const type = clean(fields.type || "text");
  return {
    type,
    title: clean(fields.title),
    body: clean(fields.body),
    mediaUrl: file ? "pending" : "",
    mediaType: file ? type : "",
  };
}

function validateUpdate(update) {
  if (!["text", "photo", "video"].includes(update.type)) return "Please choose a valid update type.";
  if (!update.title) return "Title is required.";
  if (update.type === "text" && !update.body) return "Text update content is required.";
  if ((update.type === "photo" || update.type === "video") && !update.mediaUrl) return "Please upload a photo or video.";
  return "";
}

function formatUpdate(update) {
  const createdAt = update.created_at ? new Date(update.created_at) : new Date();
  return {
    id: update.id,
    type: update.type,
    title: update.title,
    body: update.body || "",
    mediaUrl: update.media_url || "",
    mediaType: update.media_type || "",
    createdAt: createdAt.toISOString(),
    displayDate: createdAt.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
  };
}

function createAdminToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", adminPassword).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function requireAdmin(event) {
  const token = String(event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, message: "Admin login required." };
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return { ok: false, status: 401, message: "Admin login required." };
  const expected = crypto.createHmac("sha256", adminPassword).update(payload).digest("base64url");
  if (!safeCompare(signature, expected)) return { ok: false, status: 401, message: "Admin login required." };
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!decoded.exp || decoded.exp < Date.now()) return { ok: false, status: 401, message: "Admin login expired." };
  return { ok: true };
}

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
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxFieldLength);
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
  const params = new URLSearchParams({ view: "cm", fs: "1", to: primaryEmail, cc: alternateEmail, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function buildWhatsAppUrl(message) {
  return `https://wa.me/${clientWhatsAppNumber}?text=${encodeURIComponent(message)}`;
}

async function sendEmail({ subject, text, enquiry }) {
  if (!isEmailConfigured()) return { sent: false, reason: "SMTP is not configured." };
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: String(process.env.SMTP_SECURE || "true") === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: primaryEmail,
      cc: alternateEmail,
      subject,
      text,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error.message };
  }
}

async function sendWhatsApp() {
  return { sent: false, reason: "WhatsApp auto-send requires a WhatsApp API provider. Visitor fallback link is available." };
}

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function isWhatsAppConfigured() {
  return false;
}

function buildResponseMessage(emailResult, whatsAppResult) {
  if (emailResult.sent && whatsAppResult.sent) return "Enquiry sent to WhatsApp and email.";
  if (emailResult.sent) return "Enquiry email sent. WhatsApp backup link is ready below.";
  if (whatsAppResult.sent) return "Enquiry sent to WhatsApp. Email backup link is ready below.";
  return "Enquiry captured. Please use the WhatsApp or Email backup button below.";
}

function checkRateLimit(key) {
  const now = Date.now();
  const previous = recentSubmissions.get(key);
  if (previous && now - previous < 60 * 1000) return { ok: false };
  recentSubmissions.set(key, now);
  return { ok: true };
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function guessExtension(mimetype) {
  if (mimetype === "image/jpeg") return ".jpg";
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/webp") return ".webp";
  if (mimetype === "video/mp4") return ".mp4";
  return "";
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
