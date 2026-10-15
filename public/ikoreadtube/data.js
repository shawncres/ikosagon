/*
 * IKOREADTUBE data module.
 * The whole app reads videos ONLY through window.IkoData.loadVideos(), which resolves to
 *   { source: "youtube" | "sample", videos: [...] }
 * "youtube": the server feed (GET /api/ikoreadtube/feed, YouTube Data API v3): { id, title, channel, published, duration }.
 * "sample": the built-in demo videos below, used when the feed is unreachable, over quota, or not configured
 *   (for example the static PHP/GoDaddy build). Samples also carry { thumb, transcript, summaries: { less, standard, more } }.
 * Everything below is ORIGINAL sample text written for this demo. The channels are made up.
 * No real video, channel or transcript is used or implied.
 */
(function () {
  "use strict";

  var SAMPLES = [
    {
      id: "tidepool001",
      title: "Why Tide Pools Never Dry Out",
      channel: "Shoreline Notes",
      thumb: "img/tide.png",
      transcript:
        "When the tide goes out, rocks hold small pools of seawater. The pools look calm, but they are tough places to live. In summer the sun heats the water and some of it evaporates, so the salt gets stronger. A rain shower does the opposite and dilutes the pool. Animals here cope in clever ways. Mussels close their shells to keep moisture in. Anemones fold up and cover themselves with sand and shell bits. Hermit crabs move between pools to find cooler water. Most pools refill twice a day when the tide returns, which resets the temperature and the salt level. If you visit, step on bare rock, never on living things, and put every animal back where you found it.",
      summaries: {
        less: "Tide pools survive heat and salt swings because the sea refills them twice a day and the animals have tricks to hold moisture.",
        standard:
          "Tide pools are harsh homes. Sun makes the water saltier and rain makes it fresher. Mussels shut their shells, anemones cover up with shell bits, and hermit crabs hop to cooler pools. The returning tide refills everything twice a day. Visitors should walk on bare rock and put animals back.",
        more:
          "When the tide leaves, rocks keep small pools that look calm but swing between hot and salty in sun and fresh in rain. Animals cope in different ways: mussels close their shells to keep moisture in, anemones fold up and cover themselves with sand and shell pieces, and hermit crabs travel between pools to find cooler water. The tide comes back about twice a day and resets both temperature and saltiness, which is why pools rarely stay extreme for long. The host suggests visiting gently: step on bare rock rather than living things, look without poking, and return every animal to the spot where it was found."
      }
    },
    {
      id: "sourdough02",
      title: "Sourdough Starter in Seven Days",
      channel: "Crumb and Crust Club",
      thumb: "img/loaf.png",
      transcript:
        "A starter is just flour and water that catches wild yeast and friendly bacteria. On day one, mix equal weights of flour and room temperature water in a jar and cover it loosely. Each day, throw away most of it and feed what is left with fresh flour and water. By day three you may see bubbles and a sour smell. Do not panic if it goes quiet on day four, that is normal. By day seven it should double in size a few hours after feeding. Then it is ready to bake with. Keep it on the counter if you bake often, or in the fridge and feed it weekly if you do not.",
      summaries: {
        less: "Feed a jar of flour and water daily, discard most of it each time, and in about a week it will double after feeding and be ready to bake.",
        standard:
          "Mix equal weights of flour and water, cover loosely, and each day discard most of it and feed with fresh flour and water. Bubbles and a sour smell can show by day three, a quiet spell on day four is normal, and by day seven it should double a few hours after feeding. Counter if you bake often, fridge if not.",
        more:
          "A starter is flour and water that catches wild yeast and friendly bacteria. Day one: mix equal weights of flour and room temperature water in a jar and cover loosely. Every day after, discard most of the mixture and feed what remains with fresh flour and water. Around day three you may see bubbles and notice a sour smell. Activity often drops on day four, which is normal and not a sign of failure. By day seven the starter should double in size a few hours after a feeding, and then it is ready for baking. Bakers who bake often can keep it on the counter; others can store it in the fridge and feed it about once a week."
      }
    },
    {
      id: "nightsky003",
      title: "Find Five Constellations Tonight",
      channel: "Dark Sky Diaries",
      thumb: "img/sky.png",
      transcript:
        "You do not need a telescope. Go somewhere dark, give your eyes twenty minutes to adjust, and avoid your phone screen. Start with the Big Dipper, seven bright stars shaped like a ladle. Follow the two stars at the end of the bowl upward to find Polaris, the North Star. Cassiopeia is a flattened W on the other side of Polaris. In autumn look high overhead for the big square of Pegasus. Low in the south, on clear nights, you might spot the bright star Fomalhaut on its own. A free star chart app with a red screen mode helps, but try to look up more than you look down.",
      summaries: {
        less: "Let your eyes adjust in the dark, then use the Big Dipper to find Polaris, and from there Cassiopeia, Pegasus and a lone bright star in the south.",
        standard:
          "No telescope needed. Find a dark spot and wait twenty minutes for your eyes to adjust. The Big Dipper points you to Polaris, Cassiopeia is a W on the other side of it, and autumn skies show the great square of Pegasus. A lone bright star low in the south may be Fomalhaut. Use a red screen star app sparingly.",
        more:
          "You can learn five constellations without any equipment. Pick a dark place, give your eyes about twenty minutes to adjust, and keep bright phone screens away. Start with the Big Dipper, a ladle of seven bright stars. The two stars at the end of its bowl point upward to Polaris, the North Star. On the opposite side of Polaris sits Cassiopeia, a flattened W. In autumn, look high overhead for the large square of Pegasus. Low in the southern sky on clear nights, a bright star standing alone may be Fomalhaut. A free star chart app with a red screen mode can help, but the host urges you to look up more than you look down."
      }
    },
    {
      id: "bikeflat004",
      title: "Fix a Flat Bike Tire Fast",
      channel: "Handlebar Hour",
      thumb: "img/bike.png",
      transcript:
        "Carry three things: a spare tube, two tire levers and a small pump. Flip the bike or lean it so the wheel comes off easily. Let the air out, pry one side of the tire off with the levers, and pull the tube out. Before you put the new tube in, run your fingers inside the tire to find the thorn or glass that caused the flat. Add a little air to the new tube so it holds its shape, tuck it in, and seat the tire back on the rim by hand. Pump to the pressure printed on the tire sidewall. Check the tube is not pinched under the tire edge. The whole job takes about ten minutes once you have practiced.",
      summaries: {
        less: "Remove the wheel and tube, find and clear whatever pierced the tire, fit a lightly inflated spare tube, and pump to the sidewall pressure.",
        standard:
          "Carry a spare tube, two levers and a pump. Take the wheel off, let the air out, pry off one tire edge and remove the tube. Feel inside the tire for the thorn or glass. Fit a slightly inflated new tube, seat the tire by hand, avoid pinching, and pump to the sidewall pressure. About ten minutes with practice.",
        more:
          "Carry three things with you: a spare tube, two tire levers and a small pump. Get the wheel off the bike, release the air, then use the levers to pry one side of the tire off the rim and pull out the old tube. Before fitting the new one, run your fingers around the inside of the tire to find the thorn, glass or wire that caused the flat, because leaving it there will puncture the new tube too. Put a little air into the new tube so it keeps its shape, tuck it into the tire, and press the tire back onto the rim by hand. Check that the tube is not pinched at the edge, then pump to the pressure printed on the sidewall. With some practice the whole repair takes about ten minutes."
      }
    },
    {
      id: "compost0005",
      title: "Kitchen Scraps to Compost",
      channel: "Little Patch Lab",
      thumb: "img/sprout.png",
      transcript:
        "Good compost is a balance of greens and browns. Greens are wet and fresh, like vegetable peels and coffee grounds. Browns are dry, like leaves, cardboard and paper. Aim for roughly two parts brown to one part green. Chop things small, keep the pile as damp as a wrung out sponge, and turn it every week or two so air gets in. Skip meat, dairy and oily food, which attract pests. If it smells bad it is usually too wet, so add more browns. If nothing is happening it is probably too dry or too cold. In a few months you will have dark, crumbly compost that smells like forest soil.",
      summaries: {
        less: "Mix wet greens with dry browns at about one to two, keep it damp, turn it often and skip meat and dairy.",
        standard:
          "Compost needs greens like peels and coffee grounds and browns like leaves and cardboard, about one part green to two parts brown. Chop small, keep it as damp as a wrung out sponge, and turn it every week or two. Avoid meat, dairy and oil. Smells mean too wet, stalling means too dry or cold.",
        more:
          "Good compost balances greens and browns. Greens are wet and fresh, such as vegetable peels and coffee grounds, while browns are dry, such as leaves, cardboard and paper. Aim for roughly two parts brown to one part green. Chop materials small, keep the pile as damp as a wrung out sponge, and turn it every week or two to let air in. Leave out meat, dairy and oily food because they attract pests. A bad smell usually means the pile is too wet, so add browns; a pile where nothing seems to happen is probably too dry or too cold. After a few months you should have dark, crumbly compost that smells like forest soil."
      }
    },
    {
      id: "chessbasic6",
      title: "Three Chess Habits for Beginners",
      channel: "Pawn Push Weekly",
      thumb: "img/chess.png",
      transcript:
        "Beginners improve fastest with three habits. First, before every move, ask what your opponent just threatened. Many games are lost because a simple threat was ignored. Second, develop your pieces early: bring out knights and bishops, castle, and avoid moving the same piece twice in the opening without a reason. Third, check that every piece you own is protected before you make a clever attack. Do not worry about memorizing long openings. Play slow games, review your losses, and look for the one move where things went wrong. Short puzzles each day also help you spot patterns faster.",
      summaries: {
        less: "Check your opponent's threats each move, develop knights and bishops and castle, and keep your pieces protected.",
        standard:
          "Three habits help beginners: first ask what the last move threatens, second develop knights and bishops and castle instead of moving one piece twice, third make sure your pieces are protected before attacking. Skip memorizing long openings. Play slow games, review losses, and do a few puzzles daily.",
        more:
          "The host names three habits that help beginners improve fastest. One: before every move, ask what your opponent just threatened, since many games are lost to an ignored simple threat. Two: develop your pieces early by bringing out knights and bishops and castling, and avoid moving the same piece twice in the opening without a good reason. Three: before launching a clever attack, check that all of your own pieces are protected. Long opening memorization is not needed. Instead, play slower games, review your losses to find the single move where things went wrong, and do short daily puzzles to recognize patterns more quickly."
      }
    },
    {
      id: "budgetplan7",
      title: "A Simple Monthly Budget",
      channel: "Plain Money Talk",
      thumb: "img/coin.png",
      transcript:
        "A budget does not need a spreadsheet. Start by writing down your monthly take home pay. Then list fixed costs such as rent, utilities, phone and transit. Subtract those, and what is left is for food, fun and saving. A common starting point is to move savings out first, even a small amount, on the day you are paid. Track your spending for one month without judging it, just to see where money goes. Then pick one category to trim. Keep a small buffer for surprises, and review the plan once a month. If your income changes, adjust the plan instead of abandoning it.",
      summaries: {
        less: "Write down pay and fixed costs, save first on payday, track spending for a month, then trim one category.",
        standard:
          "Start with take home pay, list fixed costs, and treat what is left as food, fun and savings. Move a small amount to savings on payday. Track spending for a month without judging, then trim one category. Keep a small buffer and review monthly, adjusting when income changes.",
        more:
          "A budget does not need a spreadsheet. Begin by writing your monthly take home pay, then list fixed costs such as rent, utilities, phone and transit. What remains covers food, fun and saving. The host suggests paying yourself first by moving even a small amount into savings on payday. For one month, track your spending without judging it so you can see where the money actually goes, then choose a single category to trim. Keep a small buffer for surprises and review the plan once a month. If your income changes, adjust the plan rather than giving up on it."
      }
    },
    {
      id: "radiowaves8",
      title: "How Radio Waves Carry Sound",
      channel: "Signal School",
      thumb: "img/radio.png",
      transcript:
        "A radio station cannot send sound through the air directly, so it uses a carrier wave, a steady signal at one frequency. The sound is added to that carrier by changing it a little. In AM radio, the height of the wave changes with the sound. In FM radio, the frequency wobbles slightly instead. Your radio has an antenna that picks up many stations at once, and a tuner that selects one frequency and ignores the rest. A circuit then removes the carrier and leaves the original sound, which a speaker turns back into air vibrations. That is why moving the dial changes stations without changing the volume.",
      summaries: {
        less: "Stations put sound onto a steady carrier wave by varying its height (AM) or frequency (FM); your radio tunes one carrier and strips it away.",
        standard:
          "Radio sends sound by adding it to a carrier wave. AM changes the wave's height with the sound, FM wobbles its frequency. Your antenna catches many stations, the tuner picks one frequency, a circuit removes the carrier, and the speaker turns the leftover sound into air vibrations.",
        more:
          "Sound cannot travel across the air as a radio signal on its own, so a station uses a carrier wave, a steady signal at a single frequency, and adds the sound to it by changing the carrier slightly. In AM radio the height of the wave follows the sound, while in FM radio the frequency wobbles a little instead. Your radio's antenna picks up many stations at once, and the tuner selects one frequency while ignoring the rest. A circuit then strips away the carrier and leaves the original sound, which the speaker turns back into vibrations in the air. This is why turning the dial changes the station but not the volume."
      }
    }
  ];

  var SAMPLE_IDS = {};
  SAMPLES.forEach(function (v) { SAMPLE_IDS[v.id] = true; });

  var API = (window.IKOREADTUBE_API || "/api/ikoreadtube").replace(/\/$/, "");

  function samples(reason) {
    return { source: "sample", reason: reason || "", videos: SAMPLES.slice() };
  }

  window.IkoData = {
    api: API,
    isSample: function (id) { return SAMPLE_IDS[id] === true; },
    sampleVideos: function () { return SAMPLES.slice(); },
    /** The single place the app gets videos from. Never rejects: any failure resolves to the samples. */
    loadVideos: function (timeoutMs, opts) {
      if (typeof fetch !== "function") return Promise.resolve(samples("NO FETCH"));
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 20000);
      return fetch(API + "/feed", { headers: { Accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined, cache: opts && opts.fresh ? "no-store" : "default" })
        .then(function (res) {
          if (!res.ok) throw new Error("status " + res.status);
          return res.json();
        })
        .then(function (data) {
          var list = data && Array.isArray(data.videos) ? data.videos.filter(function (v) {
            return v && typeof v.id === "string" && typeof v.title === "string";
          }) : [];
          if (!list.length) throw new Error("empty");
          return { source: "youtube", reason: "", videos: list, fetchedAt: Number(data.fetchedAt) || 0 };
        })
        .catch(function () { return samples("YOUTUBE FEED IS NOT AVAILABLE"); })
        .then(function (r) { clearTimeout(timer); return r; });
    }
  };
})();
