// utils/sendWhatsApp.js
const axios = require('axios');
const Twilio = require('twilio');

async function sendViaTwilio({ to, body, mediaUrls = [] , twilioConfig}) {
  // to: phone like +923001234567
  // twilioConfig: { accountSid, authToken, fromNumber }
  if (!twilioConfig || !twilioConfig.accountSid) throw new Error('Twilio not configured');
  const client = Twilio(twilioConfig.accountSid, twilioConfig.authToken);

  const messages = [];
  // Twilio WhatsApp send: from: 'whatsapp:+123..', to: 'whatsapp:+92...'
  const toFmt = `whatsapp:${to}`;
  const fromFmt = twilioConfig.fromNumber.startsWith('whatsapp:') ? twilioConfig.fromNumber : `whatsapp:${twilioConfig.fromNumber}`;

  if (mediaUrls && mediaUrls.length) {
    // Send single message with media + caption
    messages.push(await client.messages.create({
      from: fromFmt,
      to: toFmt,
      body,
      mediaUrl: mediaUrls,
    }));
  } else {
    messages.push(await client.messages.create({
      from: fromFmt,
      to: toFmt,
      body,
    }));
  }
  return messages;
}

async function sendViaMeta({ to, body, mediaUrls = [], metaConfig }) {
  // metaConfig: { phoneNumberId, accessToken }
  if (!metaConfig || !metaConfig.accessToken || !metaConfig.phoneNumberId) throw new Error('Meta WhatsApp not configured');
  const url = `https://graph.facebook.com/v16.0/${metaConfig.phoneNumberId}/messages`;
  const headers = { Authorization: `Bearer ${metaConfig.accessToken}` };

  // For text-only:
  const payload = {
    messaging_product: 'whatsapp',
    to: to.replace(/^\+/, ''), // meta expects number without +
    type: mediaUrls && mediaUrls.length ? 'image' : 'text',
  };

  if (mediaUrls && mediaUrls.length) {
    // send media (first media as image) + caption as body
    payload.image = { link: mediaUrls[0] };
    payload.text = { body }; // meta allows caption via text? safer to include caption in 'image' object as 'caption' for some APIs; but using text fallback
  } else {
    payload.text = { body };
    payload.type = 'text';
  }

  const resp = await axios.post(url, payload, { headers });
  return resp.data;
}

/**
 * Main exported function:
 * config: provider-specific config or null (if you want to use tenant settings inside)
 * options: { to, body, mediaUrls }
 */
module.exports = async function sendWhatsApp({ to, body, mediaUrls = [], config = null }) {
  // ENV-level provider override (optional)
  const provider = (config && config.provider) || process.env.WHATSAPP_PROVIDER || 'twilio';

  if (provider === 'twilio') {
    const twilioCfg = (config && config.twilio) || {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_WHATSAPP_FROM, // should be whatsapp:+123...
    };
    return await sendViaTwilio({ to, body, mediaUrls, twilioConfig: twilioCfg });
  } else if (provider === 'meta') {
    const metaCfg = (config && config.meta) || {
      phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
      accessToken: process.env.META_WHATSAPP_TOKEN,
    };
    return await sendViaMeta({ to, body, mediaUrls, metaConfig: metaCfg });
  } else {
    throw new Error('Unsupported WhatsApp provider');
  }
};
