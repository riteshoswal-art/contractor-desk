# Contractor Desk: presentation script

About 6 minutes. Read the **bold** lines out loud; the rest are notes for you.

---

## Before you start (5 minutes earlier)

1. On the laptop, open a terminal in the project folder and run `npm.cmd run demo`.
2. Laptop and all phones on the **same Wi‑Fi**. Public or office Wi‑Fi (like WeWork) blocks phones from reaching the laptop; use your phone's hotspot instead.
3. On the laptop, open these once so they load fast later:
   - `/register`
   - `/builder`
   - `/admin/telegram`
4. On `/admin/telegram`, check the green box says **"Bot running. Last contact with Telegram: … seconds ago"**.
5. Have the friend's phone (contractor) and the builder's phone ready, with Telegram open.
6. Note the phone address shown in the terminal, for example `http://192.168.1.5:3100`.

---

## 1. The problem (1 minute)

**"In Pune, when a contractor walks off a residential site halfway through the work, the developer loses days, sometimes weeks, finding a replacement. They call people they know, ask around, and wait."**

**"At the same time, many small contractors (plumbers, electricians, masons) have free days and no easy way to hear about work nearby."**

**"Contractor Desk connects the two: a developer raises a ticket, the available contractors for that trade and area quote, and the developer chooses."**

---

## 2. Live demo (3–4 minutes)

### Step A: a contractor joins (friend's phone)

**"First, a contractor registers. It takes about a minute on a phone, in English, Hindi or Marathi."**

- The friend opens `http://<laptop address>:3100/register`.
- They fill in their name, **Plumbing**, **Baner** and **Available now**, plus their own mobile number, then tap **Register**.
- They tap **Connect Telegram**, then **Start** in Telegram.

**"Their mobile number stays private. It is shared only with a builder who chooses them."**

### Step B: the builder raises a ticket (builder's phone or laptop)

- Open `/builder`, register, and do **Step 1: Connect Telegram**.
- **Step 2:** raise a ticket for **Plumbing**, **Baner**, starting today or later, about 7 days.

**"The moment I raise the ticket, every available plumber in Baner who has connected Telegram gets the job."**

### Step C: the contractor quotes (friend's phone)

- In Telegram the friend gets the job, then taps **Yes, I can do it**.
- They type a price, for example **1300**, tap **Per day**, then **Send bid**.

**"One quote per contractor. They confirm before sending, so a wrong tap can be corrected."**

### Step D: the builder chooses (builder's phone)

- When everyone asked has answered (or after 10 minutes), the builder gets one message with all the quotes, grouped by unit, with ratings.
- Tap **Choose**.

**"Only now are the numbers shared: the builder gets the contractor's number, and the contractor gets the builder's. Anyone else who quoted is told politely."**

Show `/builder` on the laptop: the ticket's bar now reads **Matched**.

---

## 3. What is proven and what is not (1 minute)

**"What works today: registration, matching by trade, area and availability, Telegram questions and quotes, comparing like for like, and sharing contact only after the choice."**

**"What we have NOT proven yet:**
- **how often developers really face this problem,**
- **whether contractors will keep answering,**
- **and whether developers find the right person faster this way.**

**Our next step is to test that with real developers and contractors in Pune."**

Optional, recommended for honesty: **"The other contractors you saw listed are test entries; the one who quoted live is a real person."**

Things still undecided (only if asked):
- **Money:** pricing and who pays.
- **Messaging:** WhatsApp instead of Telegram.
- **Accounts:** proper logins for developers.

Contractor Desk does **not** verify contractors or guarantee work.

---

## If something goes wrong

| Problem | What to do |
| --- | --- |
| Phone can't open the website | It's the Wi‑Fi. Switch everyone to your phone's hotspot, then use the new address from the terminal. |
| Contractor got no job message | Check they pressed **Start** in Telegram and picked the same trade and area as the ticket, with **Available now**. |
| Quotes didn't reach the builder | They come when everyone has answered, or 10 minutes after asking. Check `/admin/telegram` shows the bot running. |
| Builder says "No available contractor could be asked" | No connected contractor matches that trade and area. Raise the ticket again with the friend's trade and area. |
