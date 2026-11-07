# Fitness Exclusive – Gym & Sports System

One central system for the gym and sports facility: members, RFID and Face ID access, turnstiles and door locks, kiosk, member app, classes, courts, POS, receipts and reports. Every branch and every screen uses the same database.

## Run it

1. Install **Node.js 22.13 or newer** from https://nodejs.org. No other packages are needed.
2. Double-click **`start-server.bat`**, or run `node server/server.js`.
3. Open http://localhost:3000/login.html.

Default staff accounts (change these right away in **Settings › My password**):

| Username | Password | Role |
|---|---|---|
| owner | owner123 | Owner, full access |
| frontdesk | desk123 | Front desk |
| coach | coach123 | Trainer |

Demo member for the member app: **M001**, PIN **1234**.

If you double-click `index.html` without starting the server, the system runs as an **offline demo** that saves only in that browser.

## Screens

| Screen | URL | Where it goes |
|---|---|---|
| Admin | `/` | Front desk PC, owner laptop |
| Kiosk | `/kiosk.html` | Self-service touch screen in the lobby |
| Gate screen | `/kiosk.html?mode=gate` | Monitor beside the turnstile (RFID + Face ID) |
| Member app | `/member.html` | Members' phones. Use "Add to Home Screen" to install it |

Other devices on the same network use the server PC's IP address, for example `http://192.168.1.10:3000`. The server prints the address when it starts, and it also appears in **Settings › Devices & System**.

## How the central system works

```
                  server/server.js  +  server/fitness.db (SQLite)
      ┌────────────────┬──────────────┬───────────────┬────────────────┐
   Admin (all       Kiosk         Gate screen     ESP32 / turnstile   Member app
   branches)                      RFID + Face     controllers         (phones)
```

- **One database** (`server/fitness.db`) holds all branches. Every change appears live on every screen.
- **The server makes every access decision** (membership, anti-passback, max occupancy, area rights). Two gates cannot let the same card in twice.
- **Backups:** automatic every 6 hours in `server/backups/`, keeping the last 30. The owner can also download one in Settings › Devices & System.
- **Audit log:** records every login, change and tap with the user's name.
- **Each screen picks its own branch** (the Branch selector at the top). Reports can filter by branch.

## Turnstile and door hardware

`hardware/esp32_turnstile.ino` is ready-made code for an ESP32 with an RC522 RFID reader and a relay.

1. In **Settings › Devices & System**, copy the **device key** of the turnstile or door.
2. Put the Wi-Fi details, the server address and the device key in the sketch, then upload it.
3. Connect the relay to the turnstile's dry-contact "open" input, or to the door lock.

If the internet or server goes down, the controller keeps working with a cached list of allowed cards and uploads those taps when the connection returns.

Door locks must be **fail-safe**: they unlock on power loss and need a manual exit button, as required by the fire code.

Controller API: `POST /api/device/tap` with header `X-Device-Key`, body `{"uid":"0004512345","mode":"in"}`, reply `{"open":true,...}`.

## Face ID

1. Turn it on in **Settings › Face ID**.
2. Enroll a member's face in **Members › Enroll face**.
3. The gate screen recognises the face and times the member in or out.

The face engine (face-api / TensorFlow.js) downloads from a CDN, so the screen needs internet on first load. The camera needs `localhost` or `https`. The system stores a face code, not a photo. For a busy main entrance, a dedicated face terminal (ZKTeco or Hikvision) with anti-spoofing is more reliable. It can call the same device API.

## What's still simulated

- **GCash / Maya / Card:** payments are simulated. For live payments, connect a gateway such as PayMongo or Xendit.
- **SMS:** messages go to an outbox page. For real SMS, connect a gateway such as Semaphore.
- **BIR:** receipts have OR numbers, VAT and a Z-reading, but the system still needs BIR accreditation (CAS / Permit to Use). Check with your accountant.
- **Internet access:** to run this online for every branch, put the server on a cloud VPS with HTTPS (for example Caddy or Nginx), change all default passwords, and keep off-site backups.
