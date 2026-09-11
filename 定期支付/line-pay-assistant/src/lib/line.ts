import { Client, WebhookEvent } from '@line/bot-sdk';

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

export const lineClient = new Client({
  channelAccessToken,
  channelSecret,
});

export const getLineClient = () => {
  if (!channelAccessToken || !channelSecret) {
    console.warn("LINE Credentials are not fully set.");
  }
  return lineClient;
};
