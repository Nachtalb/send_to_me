# Send to Me

A Chrome extension that sends the current tab's URL to your device(s) with one click.

Supported backends:

- **Telegram** — via your own bot (set up with [@BotFather](https://t.me/BotFather)).
- **Webhooks** — POSTs `{ url, title, timestamp, sentFrom, source }` JSON to any URL.
- **QR code fallback** — if nothing is configured, a QR of the current URL is shown.

You can combine any number of backends. Sending fans out to all of them in parallel.

## Usage

- Click the toolbar icon → sends to every configured backend, or shows a QR if none.
- Right‑click the page (or a link) → context menu with:
  - No backends: *Show QR code*
  - One backend: *Send to \<name\>*
  - Multiple backends: submenu with *All* plus each target individually

## Configuring

Open the extension's options page (`chrome://extensions` → *Details* → *Extension options*, or right‑click the icon → *Options*).

### Telegram

1. Open [@BotFather](https://t.me/BotFather) and run `/newbot` to get a bot token.
2. Start a chat with your new bot so it can message you.
3. Get your chat ID from [@userinfobot](https://t.me/userinfobot).
4. Paste the token and chat ID into the settings. For group topics, add the topic ID.
5. Hit **Test** — it fetches `getMe` (shows the bot's username) and sends a test message.

### Webhooks

Add a name and URL. Click **Test** to send a sample payload:

```json
{ "url": "https://example.com/test-url", "title": "Send to Me — test", "timestamp": "…" }
```

## Installing (unpacked)

1. Open `chrome://extensions`
2. Enable *Developer mode*
3. *Load unpacked* → select this folder

## License

MIT
