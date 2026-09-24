import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const contactToEmail = process.env.CONTACT_TO_EMAIL || "shawn@ikosagon.com";

export async function POST(request: Request) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const projectType = String(formData.get("projectType") ?? "");
  const message = String(formData.get("message") ?? "");

  if (!name || !email || !message) {
    return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
  }

  if (!resend || !process.env.CONTACT_FROM_EMAIL) {
    return NextResponse.json(
      { ok: false, error: "Contact route not configured yet. Add RESEND_API_KEY and CONTACT_FROM_EMAIL." },
      { status: 500 },
    );
  }

  await resend.emails.send({
    to: contactToEmail,
    from: process.env.CONTACT_FROM_EMAIL,
    replyTo: email,
    subject: `Ikosagon inquiry from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nProject type: ${projectType}\n\n${message}`,
  });

  return NextResponse.redirect(new URL("/contact?sent=1", request.url), 303);
}
