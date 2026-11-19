# OREMUS design scope: what goes into the MVP

19 November 2026. The owner shared a designer's scope for the **OREMUS Project**, a SaaS system for a choir music marketplace, social network and choir management platform. The designer will provide the high-fidelity UI design and the design system. This note sorts that scope against what SolfaScores already has live.

If OREMUS becomes a separate product, the "already built" items are still the ones it can reuse.

**Status (owner, 19 November 2026): songs stay free, and the financial system isn't built yet.** That means no prices, purchases, payments, wallets, payouts or refunds. Payment providers are chosen (decision 1), and the other payment decisions will be made later. Section 2 can be built without money; section 3 waits.

## The scope as given

- **Public website:** landing page, About, Pricing, Contact, creator discovery, song marketplace, authentication.
- **Creator dashboard:** overview, song upload flow, pricing setup, wallet, withdrawals, revenue analytics, transaction history, social feed, profile management.
- **Choir dashboard:** overview, song marketplace, search and filtering, purchase flow, wallet top-up, download management, playlist/folder management, refund requests, choir management, member invitation flow, member restriction management, social feed.
- **Chorister dashboard:** assigned songs, song viewer/player, social feed, notifications, profile.
- **Admin dashboard:** user management, song approval, withdrawal approval, refund approval, wallet top-up approval, analytics, moderation.

## What the scope really is

It's three products in one, plus a back office:

1. **Choir management and learning:** groups, members, songs to learn, the player. SolfaScores already does this.
2. **A paid marketplace:** creators sell songs, choirs buy them, and the money moves between them.
3. **A social network:** feeds for creators, choirs and choristers.
4. **Admin:** approvals, users and moderation.

The MVP only needs the smallest version of the marketplace on top of what exists: **a creator uploads and prices a song → admin approves it → a choir buys it → its choristers learn it → the creator gets paid.** Everything else can wait.

## 1. Already built (live on solfascores.com)

| Scope item | What SolfaScores has |
|---|---|
| Authentication | Sign-up and sign-in |
| Song marketplace (browsing) | Public song library, for free songs only |
| Search & filtering | Search by title, composer or words; filters for repertoire, my songs, has sol-fa and tags |
| Choir dashboard overview | Home: next service, leader's to-do list, readiness per part |
| Choir management | Groups, parts, roles, schedule, song orders, attendance, notices |
| Member invitation flow | Code, invite link, QR code, WhatsApp |
| Assigned songs (chorister) | "Learn for upcoming", "my part" |
| Song viewer/player | Sol-fa score with four-part playback, tempo and key change |
| Profile (chorister) | The Me tab |
| Song upload flow | **Mostly:** type, paste or scan sol-fa, and attach the sheet. No price or approval step yet |
| Playlist/folder management | **Partly:** repertoire, and song orders arranged by section |
| Download management | **Partly:** songs and sheets saved on the phone for offline use |
| Notifications | **Partly:** notices inside the app. No push notifications yet |

That's 13 of the 40 items, fully or partly done.

## 2. MVP: can be built now (no decisions needed)

- **Public site:** landing page, About, Contact.
- **Creator profile:** a public creator page with name, photo and bio.
- **Song upload, finished:** an "I own the rights to this song" confirmation, and a "waiting for approval" status. No price while songs are free.
- **Admin:** song approval queue, basic user management (find, suspend), and taking down a song that's reported.
- **Email notifications:** now possible because of solfascores.com. Examples: sign-in codes, password resets, "your song was approved".

## 3. On hold: the paid part, once the payment decisions are made (section 5)

Not to be built yet (owner, 19 November 2026).

- **Pricing setup:** a price on each song.
- **Purchase flow (choir)**, which unlocks the song for the whole choir.
- **Pricing page (public)**, which depends on the fee model.
- **Creator dashboard overview and transaction history:** sales and earnings. Simple totals, no charts yet.
- **Creator earnings and payouts.** Either:
  - **automatic:** the payment provider splits each sale and pays the creator directly, so there's no wallet, no withdrawals and no withdrawal approval; or
  - **manual:** an earnings balance, plus withdrawal requests the admin approves.
- **Refund requests and refund approval:** a simple request form that the admin decides on.
- **Purchased songs for offline use:** works like today's offline saving. Whether PDFs can be downloaded is a decision (piracy).

## 4. After the MVP

- **Social:** social feeds for creators, choirs and choristers, plus moderation for them. This is the largest piece of design and build in the scope, and the sale doesn't depend on it.
- **Wallet:** wallet top-up and top-up approval.
- **Marketplace extras:** creator discovery (featured creators, following, rankings).
- **Analytics:** revenue analytics for creators, analytics for the admin.
- **Choir extras:** member restrictions, and custom folders beyond the repertoire and song orders.
- **Notifications:** push notifications. They need a provider outside Cloudflare.

## 5. The owner's decisions, before the paid part

Decisions 2 to 6 will be made later (owner, 19 November 2026).

1. **Payment provider: decided. Flutterwave and Stripe** (owner's choice, 19 November 2026, in place of Paystack).
   - **Suggested split, to confirm:** Flutterwave for payers in Nigeria and the rest of Africa (naira, cards, bank transfer, USSD), Stripe for payers abroad.
   - **Stripe needs a company in a country Stripe supports.** A business registered in Nigeria can't open a Stripe account (Stripe covers Nigeria only through Paystack); founders usually register a US or UK company. Flutterwave also takes foreign cards, so it can cover everyone at launch, and Stripe can be added once that company exists.
   - **Paying creators automatically:** Flutterwave's split payments (subaccounts) divide each sale at checkout between the creator's bank account and SolfaScores' fee, so the MVP needs no wallet and no withdrawals. Paying creators through Stripe would need Stripe Connect, which depends on where the creators live.
   - **The phone apps:** Apple, and Google in most countries, expect digital content unlocked inside the app to be sold through their own in-app payments. Purchases on the website aren't affected. Before the store builds sell songs, check the current rules (for example, selling on the website only, with the app showing what was bought).
2. **Pay per purchase, or a wallet?** Recommended: pay per purchase for the MVP (card, bank transfer, USSD). A wallet means holding customers' money, which may need a licence in Nigeria. Check that with the provider before designing around it.
3. **SolfaScores' fee, and how creators get paid:** automatic split or manual withdrawals (see section 3).
4. **What a purchase gives:** one choir's use of the song, for all its members? Forever? PDF downloads?
5. **Creators' rights:** what creators must confirm, and what the admin checks before approving a song.
6. **Refund policy.**
7. **Do free songs stay? Decided: yes.** Every song stays free and open to everyone (owner, 19 November 2026).

## For the design

- **Design the MVP screens first** (sections 2 and 3), in that order. The social feeds can come later without holding anything up.
- **Build on SolfaScores' existing design system** rather than starting a new one. It already has the colours, part colours, fonts, light and dark modes, the s:s icon and the red-screen background (see "Decisions already made" in `CLAUDE.md`). A second system would mean redoing screens that already work.
- **Leave the Pricing page and the wallet screens** until decisions 2 and 3 are made, since they change those screens.

The free part (choir management and learning) is ready for the pilot choir now, so the pilot can run while the marketplace MVP is designed and built.
