import twilio from "twilio";
const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM_NUMBER;

export async function sendSms(to: string, body: string): Promise<{ providerMessageId?: string }> {
  if (!sid || !token || !from) {
    console.log("[sms] Skipping send (Twilio env not set). To:", to, "Body:", body);
    return {};
  }
  const client = twilio(sid, token);
  const msg = await client.messages.create({ to, from, body });
  return { providerMessageId: msg.sid };
}
