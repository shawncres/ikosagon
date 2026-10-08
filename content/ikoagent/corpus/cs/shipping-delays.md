---
title: "Shipping delays & tracking"
---

## Standard SLAs
<!-- caller: Ground shipping usually takes 3 to 5 business days after the order ships, and expedited takes 1 to 2 business days. -->
- **Ground:** 3–5 business days after ship confirmation.
- **Expedited:** 1–2 business days.
- Weather, carrier strikes, and customs holds sit outside the guarantee window — explain clearly and offer a goodwill option when the delay is ours.

## Say this
"I see your order left the warehouse on schedule. Carrier tracking shows it is still in transit. If it has not moved in 48 hours, I can open a tracer and discuss a replacement or refund path."

## Lost package
<!-- caller: If a package has had no tracking updates for 7 days past the expected delivery date, we treat it as lost and can send a replacement or issue a refund. -->
After **7 calendar days** with no scan updates past the expected delivery, treat as lost: replacement or refund. Log disposition `SHIP_LOST`.

## Address changes
<!-- caller: We can redirect a package only until the carrier marks it out for delivery. -->
We can redirect only before the carrier marks "out for delivery." After that, schedule a re-ship once the original returns or is confirmed undeliverable.
