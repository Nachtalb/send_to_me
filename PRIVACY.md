# Privacy Policy

_Last updated: 2026-04-25_

This privacy policy describes how the **Send to Me** browser extension
(the "Extension") handles information when you use it.

## Summary

The Extension does not collect, sell, share, or transmit any personal data to
the Extension's author. It does not use analytics, advertising, telemetry,
or remote logging. The only network requests it makes are the ones **you**
configure: sending the current tab's URL to a Telegram bot you set up, or to
a webhook URL you provide.

## What is sent, and where

The Extension sends data **only** to the destinations you configure in its
options page:

### Telegram backend

When you trigger a send and have a Telegram destination configured, the
Extension calls the Telegram Bot API
(`https://api.telegram.org/bot<your-token>/sendMessage` or
`/sendPhoto`) using **your own bot token**. The message contains:

- The current tab's URL.
- The current tab's title (if it differs from the URL).
- A short attribution line (e.g. `— Sent from Chrome via Send to Me`).
- Optionally, a PNG screenshot of the visible part of the current tab
  (only if you have "Send screenshot" enabled for that destination).

Telegram receives the request because that's the destination you chose.
The Extension does not send a copy anywhere else. Telegram's own privacy
policy applies to whatever they store on their end.

### Webhook backend

When you trigger a send to a webhook destination, the Extension makes a
single HTTP `POST` to **the URL you supplied**, with this JSON body:

```json
{
  "url": "<current tab URL>",
  "title": "<current tab title>",
  "timestamp": "<ISO 8601>",
  "sentFrom": "<your device name, or auto-detected browser name>",
  "source": "https://github.com/Nachtalb/send_to_me"
}
```

Whatever service is at that URL receives the payload. The Extension does
not send a copy anywhere else.

### QR-code fallback

When no backend is configured, or when you choose "Show QR code", the
Extension generates a QR code from the current URL **locally in your
browser**. No network request is made for this.

## What is stored locally

The Extension uses `chrome.storage.sync` to keep your configured
destinations and a few small preferences. If you are signed in to Chrome,
this storage is synced across your own devices through Google's normal
Chrome-sync mechanism — never to the Extension's author.

The values stored are:

| Key | Purpose |
| --- | --- |
| `telegrams` | The list of Telegram destinations you've configured: name, bot token, chat ID, optional topic ID, and per-destination flags ("include screenshot", "disable preview"). |
| `webhooks` | The list of webhook destinations you've configured: name and URL. |
| `device` | Your chosen device name for the "Sent from" attribution line (or empty to auto-detect). |

The Extension does not write to `localStorage`, IndexedDB, cookies, or any
disk-backed storage outside of `chrome.storage.sync`.

## What permissions are used and why

- `host_permissions` for `<all_urls>` — required so the Extension can
  capture a screenshot of the visible tab (`chrome.tabs.captureVisibleTab`)
  for inclusion in Telegram messages, on whichever site you're currently
  viewing. The Extension never reads or modifies page content; it only
  captures the rendered pixels of the visible viewport, and only when you
  trigger a send to a Telegram destination that has screenshots enabled.
- `tabs` and `activeTab` — to read the URL and title of the active tab
  when you trigger a send.
- `contextMenus` — to add the right-click menu entries that send the
  current page or link.
- `storage` — to keep your configured destinations (described above).
- `notifications` — to show a small system notification with the
  per-destination success/failure summary after a send.

## What is not done

- No data is sent to the Extension's author.
- No analytics or telemetry of any kind.
- No advertising or third-party scripts.
- No content scripts are injected into the pages you browse.

## Affiliation

This Extension is an independent project. It is not affiliated with,
endorsed by, or sponsored by Telegram or any webhook receiver service.

## Changes

This policy may be updated to reflect changes in the Extension. Material
changes will be reflected in the "Last updated" date at the top of this
file. The current version is always available in the source repository:
<https://github.com/Nachtalb/send_to_me/blob/main/PRIVACY.md>

## Contact

Questions or concerns about privacy:
<https://github.com/Nachtalb/send_to_me/issues>
