# Cloudflare Quick Tunnel

This project can be shared publicly with a Cloudflare Quick Tunnel so people on other Wi-Fi networks or mobile data can open your live local preview.

## What this gives you

- A public `https://...trycloudflare.com` link
- Live preview of your local app running on port `4000`
- No inbound port forwarding on your router

## One-time setup

Install `cloudflared` on Windows:

```powershell
winget install --id Cloudflare.cloudflared
```

Official Cloudflare download docs:

https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/

## Start the public preview

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File backend\start-public-preview.ps1
```

Or in two steps:

```powershell
powershell -ExecutionPolicy Bypass -File backend\start-server-4000.ps1
powershell -ExecutionPolicy Bypass -File backend\start-cloudflare-quick-tunnel.ps1
```

The tunnel script will print a public `trycloudflare.com` URL. Share that link.

## Live changes

- Keep your local server running
- Keep the tunnel window open
- Save code changes locally
- Refresh the public preview page on the other device

## Important note

This setup uses a Cloudflare **Quick Tunnel**, which is meant for testing and development. Cloudflare documents these current limits:

- no SLA / not for production
- hard limit of `200` in-flight requests
- no `SSE` support

Official docs:

https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/

## Common gotcha

Cloudflare documents that Quick Tunnel mode does **not** work if this file exists:

`%USERPROFILE%\.cloudflared\config.yml`

If you already use a named tunnel, temporarily rename that file before starting the quick tunnel.
