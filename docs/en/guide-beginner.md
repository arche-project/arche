# Beginner guide — your offline library in an hour

> Never opened a terminal? This guide is for you. Nothing to type.
> Français : [guide-debutant.md](../fr/guide-debutant.md)

## What you will get

A disk (internal or external) holding Wikipedia, a dictionary, health, repair, gardening and energy
guides, and an artificial intelligence that runs **on your computer** and answers your questions
**without internet**. Once set up, everything keeps working even if the network is down for weeks.

## What you need

- A computer (Windows, Mac or Linux) with at least **8 GB of memory**. An old laptop is fine.
- **Space**: 150 GB for the essentials, 500 GB to be comfortable, 1 TB for everything.
  A **1 TB USB SSD** (≈ €60–90) is the best choice: plug it into any machine, lend it, keep it in a drawer.
- An **internet connection** for the preparation (one night for 500 GB on fibre; several days on
  ADSL — that is normal, it resumes by itself if it drops).

## Step 1 — Download Arche

1. Open the project's **releases** page.
2. Download the file matching your computer: `arche-windows-x64.zip`, `arche-macos-arm64.zip` or
   `arche-linux-x64.zip`.
3. Unzip it **on the disk where you want the library** (for instance the external SSD).

> On Mac the first launch may say "unidentified developer": right-click → Open. On Windows,
> SmartScreen may ask "Run anyway". That is because the project doesn't pay for a signing
> certificate, not because it is dangerous — the code is public.

## Step 2 — Answer three questions

Double-click `arche` (or `arche.exe`). A page opens in your browser.

1. **"Which sounds most like you?"** → *I'm new to this*.
2. **"Where will the library live?"** → "This computer" or "laptop + USB SSD". If you are
   preparing a disk for a Raspberry Pi or for someone else, pick that preset: Arche adapts the size
   and the AI model.
3. **"Which languages do you read?"** → tick at least one. English adds a lot of technical content.
4. **"Which topics do you absolutely want?"** → *The core* is already ticked. Add *Health*,
   *Homestead*, *Local AI* if you have room. The rest is chosen for you.

Arche then shows **your selection**: every line says *why* it is ticked ("essential",
"recommended, fits on disk"…). The bar at the top shows the space used. Untick what you don't want.
Then **Start downloads**.

## Step 3 — Wait (and do something else)

Downloads run in order: small tools first, big files last. Within minutes you already have
medicine, water, repair. Full Wikipedia arrives last.

You can **close the window, switch the computer off, unplug the disk**: next time, Arche resumes
exactly where it stopped. Every file is verified on arrival; a damaged file is re-downloaded automatically.

## Step 4 — Use the library

Launch `arche` again. **Open the library** opens Kiwix in your browser: a home page with all your
encyclopedias and guides, with search. Bookmark it. On the local network (home Wi-Fi) other
devices — phones included — can reach it at the address shown.

For the AI: open **Open WebUI** (address shown in Arche). Ask in plain language: "how do I purify
river water?", "how do I keep beans without a fridge?". It answers from what it knows and, when
enabled, from the library (see [ai-assistant.md](ai-assistant.md)). **It can be wrong**: for health,
always check WikiMed or *Where There Is No Doctor*.

## Step 5 — Don't wait for the outage to test

Next weekend, **switch the router off** and use the library for an hour. Look up how to fix
something at home. If it works cut off, it will work on the day it matters.

## Updating

Once a season, with internet: launch `arche`, click **Check for updates**. Only changed files are
re-downloaded (Wikipedia is rebuilt every month or two).

## If it doesn't work

- **"Not enough memory for a local AI"**: your machine has under 4 GB. The library still works, without AI.
- **The space bar is red**: untick *Wikipedia EN* or *full Wikipedia FR* and keep the "no pictures" version.
- **A download keeps failing**: the source may be down that day; the catalog is checked weekly. Retry, or untick it.
- **You are already offline**: ask someone to prepare a disk with Arche and bring it (see
  "Preparing a disk for someone else" in the expert guide). Everything works without network from there.

## What Arche doesn't do

It doesn't forecast the weather, doesn't replace a doctor, doesn't make electricity. It puts what
humanity knows within reach — the rest is up to you. Read [BLIND-SPOTS.md](BLIND-SPOTS.md).
