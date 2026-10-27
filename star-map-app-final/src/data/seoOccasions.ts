import type { OccasionArtworkItem } from "@/components/OccasionStorySection";

export type SeoOccasion = {
  slug: string;
  label: string;
  intro: string;
  detail?: string;
  exampleLine: string;
  faqs: { question: string; answer: string }[];
  /** Optional GSC-tuned `<title>` — defaults to "Star Map for {label} | StarMapCo". */
  seoTitle?: string;
  /** Optional meta description override. */
  seoDescription?: string;
  /** Optional on-page H1 override. */
  seoH1?: string;
  /** Optional story section replacing the generic “Why a … star map works” block. */
  storyHeading?: string;
  storyParagraphs?: string[];
  storyCtaHref?: string;
  storyCtaLabel?: string;
  /** Occasion artwork shown in the story section (paths under /public). */
  artwork?: OccasionArtworkItem[];
};

export const seoOccasions: SeoOccasion[] = [
  {
    slug: "engagement",
    label: "Engagement",
    seoTitle: "Engagement Star Map Gift — Proposal Night Sky | StarMapCo",
    seoH1: "Engagement Star Map Gift",
    seoDescription:
      "Create a personalized engagement star map from the proposal date and place. Free preview, then framed + HD digital (free shipping $89+), unframed poster, or instant HD for same-night gifts.",
    intro:
      "Celebrate the engagement with a star map that captures the exact sky from the proposal night. Personal, romantic, and ready to print.",
    detail:
      "Common date ideas include the proposal date, the engagement party, or the night you decided together. Add names and a short line to make it feel like a framed promise.",
    exampleLine: "Engagement · Brooklyn, NY · June 14, 2024",
    faqs: [
      {
        question: "Is a star map a good engagement gift?",
        answer:
          "Yes. A star map captures the exact night sky from the proposal, making it a meaningful, personalized engagement gift for couples and families.",
      },
      {
        question: "Can I add names and a proposal date?",
        answer:
          "You can add names, a title, and the proposal date in the editor before checkout. The same design works for framed print, unframed poster, or HD digital.",
      },
      {
        question: "Do I need the exact proposal time?",
        answer:
          "Exact time is optional. Date plus city or venue still produces an accurate, beautiful sky — add time if you want Moon and planet placement precise.",
      },
      {
        question: "Which gift format fits an engagement best?",
        answer:
          "Recommended presentation is framed print + HD digital for a wall-ready gift plus an instant file. Instant HD alone works when you need a same-night or long-distance gift.",
      },
    ],
  },
  {
    slug: "proposal",
    label: "Proposal",
    seoTitle: "Proposal Star Map Gift — Custom Night Sky | StarMapCo",
    seoH1: "Proposal Star Map Gift",
    seoDescription:
      "Turn the proposal night into a custom star map gift — exact sky from your date and location. Free preview, then framed + HD, poster, or instant HD download.",
    intro:
      "Turn the proposal moment into a timeless keepsake with a custom star map that matches the exact sky.",
    detail:
      "Common date ideas include the proposal night, the first date, or the day you decided on forever. Add names and a short line to make it feel like a framed promise.",
    exampleLine: "The Proposal · Paris, France · May 3, 2023",
    faqs: [
      {
        question: "Can I create a star map for the proposal night?",
        answer:
          "Yes. Enter the proposal date and location to generate an astronomically accurate map of the night sky from that moment.",
      },
      {
        question: "Do I get a print-ready file?",
        answer:
          "After checkout you can download a high-resolution PNG for framing, or order a framed or unframed print shipped to your door.",
      },
      {
        question: "Can I include the proposal location name?",
        answer:
          "Yes. Add a custom location line, names, and a dedication in the editor before you unlock the final file or print.",
      },
      {
        question: "Is a proposal star map good for anniversaries too?",
        answer:
          "Yes. The proposal date works well for an engagement gift, and you can reorder the same design for anniversaries in a new style or frame size.",
      },
    ],
  },
  {
    slug: "new-baby",
    label: "New Baby",
    seoTitle: "New Baby Star Map | Birth Night Sky Gift | StarMapCo",
    seoH1: "New Baby Star Map Gift",
    seoDescription:
      "The night sky over the place they arrived, with name, date and city. Free preview, no account. HD from $9; framed + HD for the nursery.",
    intro:
      "The sky on the night they arrived, with their name, date and city. A nursery keepsake that grows with them. Preview free, no account.",
    detail:
      "Use the birth date and time if you have it, or the first night home. Parents often add the baby’s name, birth weight, and a short welcome line before choosing framed + HD for the nursery wall.",
    exampleLine: "Welcome, Noah · Austin, TX · March 18, 2024",
    storyHeading: "A keepsake they grow into, not out of",
    storyParagraphs: [
      "Birth announcements list the weight, the length and the time. A new baby star map adds something those numbers cannot: the sky that was overhead at the moment a child arrived. It is a quiet, lasting gift for a nursery wall, and it grows up with the child instead of being outgrown like a newborn outfit.",
      "To create one, enter the birth date, the time from the hospital bracelet or birth certificate, and the town where the baby was born. Then add a title. Welcome, Oliver works well, as does the full name with the date and city underneath. Soft parchment tones like our Heirloom style suit a nursery, while a dark night style feels right for an older child's room.",
      "This is a gift that new parents appreciate weeks after the flowers have wilted. Grandparents often order one for their own home as well, so there is a matching map in two places. It also makes a thoughtful baby shower gift if you create it soon after the birth and send it to arrive while the family is settling in.",
      "There is no need to commit before you see it. The StarMapCo preview is free, with no account required. Check the spelling of the name, try a couple of styles, and choose a format only when you are happy. The digital option is useful if you want to share the design right away; a framed print is ready to hang above the crib.",
      "Later on, the map becomes a conversation piece. Children like being told that these were their stars, and many families add a map for each sibling so the set grows over the years.",
    ],
    storyCtaHref:
      "/editor?mode=quick&source=occasion-new-baby-story-preview&utm_source=site&utm_medium=landing&utm_campaign=new-baby_story",
    storyCtaLabel: "Start free preview",
    artwork: [
      {
        src: "/examples/example-new-baby-heirloom.webp",
        alt: "New baby star map example in Heirloom style",
      },
      {
        src: "/examples/example-birthday-noir.webp",
        alt: "Birth night star map example in a dark noir style",
      },
      {
        src: "/printproof/unframed-mockup.jpg",
        alt: "Unframed star map print mockup for a nursery gift",
      },
    ],
    faqs: [
      {
        question: "Is a star map a good newborn gift?",
        answer:
          "Yes. A birth-night star map is a thoughtful keepsake that captures the sky exactly as it appeared when they arrived — suited for baby showers, hospital visits, and first birthdays.",
      },
      {
        question: "Can I include the baby’s name on the print?",
        answer:
          "Yes. Add the baby’s name, birth date line, and a short dedication in the editor before checkout. The same design works for framed print, canvas, or HD digital.",
      },
      {
        question: "Do I need the exact birth time?",
        answer:
          "Exact time improves Moon and planet placement, but date plus city or hospital location still produces a beautiful, meaningful nursery print.",
      },
      {
        question: "Which gift format fits a new-parent keepsake best?",
        answer:
          "The premium gift route is framed print + HD digital so the wall art ships ready to hang and parents get an instant file for sharing. Unframed poster lowers the total if they already picked a frame.",
      },
      {
        question: "Is it appropriate as a baby shower gift?",
        answer:
          "Yes, once the baby has arrived. Before the birth you would not yet have the date and time, so many people give it after the birth instead.",
      },
      {
        question: "Which style works best in a nursery?",
        answer:
          "Light parchment styles tend to blend with nursery decor, while navy and dark styles suit a bolder room. Try both in the free preview.",
      },
      {
        question: "Can I make matching maps for siblings?",
        answer:
          "Yes. Create a map for each child's birth night in the same style so they hang well together.",
      },
    ],
  },
  {
    slug: "memorial",
    label: "Memorial",
    seoTitle: "Memorial Star Map | Remembrance Gift | StarMapCo",
    seoH1: "Memorial Star Map Gift",
    seoDescription:
      "Honor a loved one with the night sky from a date that mattered: a birthday, a wedding or their passing. Gentle, personal. Free preview.",
    intro:
      "A quiet way to remember someone: the stars from a date that mattered, with their name and a short line. Take your time; the preview is free.",
    detail:
      "Many families use a birthday, anniversary, or the day of passing. Add a simple dedication line to keep the design quiet and respectful.",
    exampleLine: "In Loving Memory · London, UK · October 9, 2022",
    storyHeading: "Choosing the date, and the words",
    storyParagraphs: [
      "When someone is gone, the things that comfort most are often the simplest. A memorial star map shows the sky over a particular place on a particular night, and gives a grieving family something calm and beautiful to hold onto. It does not try to say too much. It simply marks a moment and keeps it.",
      "Families choose different dates. Some use the day their loved one was born, as a celebration of the life rather than the loss. Some use a wedding date, an anniversary, or a favourite trip. Others choose the night of passing, because that sky felt significant. There is no right answer; the best date is the one that feels true to the person.",
      "Wording matters with this kind of gift. A short title such as In Loving Memory, followed by a name and the years, is often enough. Some people add a line the person used to say. Keep it gentle and personal, and read it aloud before you finalise it.",
      "If you are making this for someone else who is grieving, the free StarMapCo preview lets you take your time without pressure. There is no account to set up and nothing to pay until you are sure. You can choose a digital file to share with relatives in different places, or a framed print that can sit on a mantel, at a memorial service, or beside a photograph.",
      "A memorial map is not about astronomy. It is about being able to look at a wall and remember that, on a certain night, the person you miss was here, and the stars were exactly where they are shown.",
    ],
    storyCtaHref:
      "/editor?mode=quick&source=occasion-memorial-story-preview&utm_source=site&utm_medium=landing&utm_campaign=memorial_story",
    storyCtaLabel: "Start free preview",
    artwork: [
      {
        src: "/examples/example-memorial-starlace.webp",
        alt: "Memorial star map example in Starlace style",
      },
      {
        src: "/home-mockups/gallery-star-poster.png",
        alt: "Star map poster mockup for a remembrance gift",
        aspect: "4:3",
      },
    ],
    faqs: [
      {
        question: "Is a memorial star map appropriate?",
        answer:
          "Yes. It’s a gentle, meaningful way to commemorate a special date and place — suited for remembrance gifts and family keepsakes.",
      },
      {
        question: "Can I add a short dedication?",
        answer:
          "You can customize the text with names, dates, and a short message in the editor before checkout.",
      },
      {
        question: "Can I use any memorial date?",
        answer:
          "Yes. Choose the date that feels most meaningful to your family — birth date, anniversary, or another remembrance day.",
      },
      {
        question: "What delivery format works best for memorial gifts?",
        answer:
          "Framed print is common for display at home; HD digital lets distant family receive the same design immediately without shipping wait.",
      },
      {
        question: "Can I order copies for several family members?",
        answer:
          "You can create the same map and order it more than once, or choose the digital file to share and print locally.",
      },
      {
        question: "Can it be displayed at a funeral or memorial service?",
        answer:
          "Yes. A framed print works well beside photographs at a service and can be taken home afterwards.",
      },
    ],
  },
  {
    slug: "graduation",
    label: "Graduation",
    seoTitle: "Graduation Star Map Gift | Ceremony Night Sky | StarMapCo",
    seoH1: "Graduation Star Map Gift",
    seoDescription:
      "The sky over their ceremony or campus, with name and class year. A keepsake beyond card and cash. Free preview; HD, print or framed.",
    intro:
      "The sky over the campus on the night they made it, with their name and class year. Preview free, no account.",
    detail:
      "Use the ceremony date or the celebration night. Add the school name, class year, or degree to personalize the print.",
    exampleLine: "Class of 2024 · Boston, MA · May 25, 2024",
    storyHeading: "A graduation gift that outlasts the gown",
    storyParagraphs: [
      "Graduation gifts tend to fall into two camps: practical things for the next stage, or an envelope of money. Both are useful and both are forgotten quickly. A graduation star map is different. It records the sky over the campus or ceremony venue on the day the degree, diploma or certificate was earned, and it becomes something the graduate keeps long after the gown is returned.",
      "It suits high school, college, university, trade school and postgraduate milestones alike. Enter the ceremony date and location, add a title such as Class of 2026 along with the graduate's name and school town, and choose a design. A deep navy aurora style feels celebratory; a clean minimalist style fits a first apartment or dorm wall.",
      "Parents often pair the map with a practical gift so there is something meaningful to unwrap alongside it. Grandparents like it because it is personal without needing to know what the graduate wants. Friends sometimes choose the digital version so it can be printed wherever the graduate ends up living next.",
      "You can see the result before you pay. StarMapCo's preview is free and does not ask you to create an account. Try different titles, check that the school and year read correctly, and choose a format when it feels finished: an instant digital download, an unframed print, or a framed print.",
      "A small detail makes it land: write a line on the back of the frame or in the card about what you saw the graduate work through to get there. The map marks the night; your words explain why it mattered. Years later, that combination is what turns a print into an heirloom rather than decor.",
      "For graduates who are moving away, the map is a reminder of the place where they grew up or studied, and of the night they crossed the stage, no matter where they hang it.",
    ],
    storyCtaHref:
      "/editor?mode=quick&source=occasion-graduation-story-preview&utm_source=site&utm_medium=landing&utm_campaign=graduation_story",
    storyCtaLabel: "Start free preview",
    artwork: [
      {
        src: "/examples/example-graduation-aurora.webp",
        alt: "Graduation star map example in Aurora style",
      },
      {
        src: "/home-mockups/offer-digital-hd.png",
        alt: "Digital HD star map mockup for a graduation gift",
        aspect: "4:3",
      },
    ],
    faqs: [
      {
        question: "Is a star map good for graduation?",
        answer:
          "Yes. It captures the exact sky from the graduation moment and makes a unique personalized gift for high school, college, or grad school.",
      },
      {
        question: "Can I customize school name and date?",
        answer: "You can add names, a title, school or degree line, and the graduation date before checkout.",
      },
      {
        question: "Can I use the graduation year only?",
        answer:
          "Yes. If you don’t have a specific date, use the ceremony day or a meaningful date in that year.",
      },
      {
        question: "Do graduation gifts ship in time for the party?",
        answer:
          "Instant HD unlocks immediately after checkout for same-day gifting. Framed and poster prints ship from our print partner — preview first, then allow production and transit time.",
      },
      {
        question: "What location should I enter?",
        answer: "The ceremony venue or the campus town. Either gives an accurate sky for that place.",
      },
      {
        question: "Is a digital version available for graduates who are moving?",
        answer: "Yes. The digital file can be printed wherever they settle.",
      },
      {
        question: "Can I make one for a past graduation?",
        answer:
          "Yes. Any past date works, so it can mark a graduation from years ago as a reunion or milestone gift.",
      },
    ],
  },
  {
    slug: "first-home",
    label: "First Home",
    intro: "Commemorate a first home with a star map from move‑in night or closing day.",
    detail:
      "Use the closing date, move‑in day, or the first night you spent there. Add your new address line or a short dedication.",
    exampleLine: "Our First Home · Denver, CO · August 2, 2023",
    faqs: [
      {
        question: "Can I use a star map for a new home?",
        answer: "Yes. Use your move‑in date and address to create a personalized keepsake.",
      },
      {
        question: "Is the file print‑ready?",
        answer: "You get a high‑resolution PNG designed for framing.",
      },
      {
        question: "Do I need the exact address?",
        answer: "A city or neighborhood is fine. Exact coordinates are optional.",
      },
    ],
  },
  {
    slug: "long-distance",
    label: "Long Distance",
    seoTitle: "Long Distance Star Map Gift — Shared Night Sky | StarMapCo",
    seoH1: "Long Distance Star Map Gift",
    seoDescription:
      "Celebrate long-distance love with a custom star map from your shared date and place. Free preview, then instant HD for fast delivery or framed print shipped to them.",
    intro: "Celebrate long‑distance love with a star map that marks a shared date and sky.",
    detail:
      "Choose the date you became long‑distance, the last time you were together, or a reunion. Add both city names in the dedication line.",
    exampleLine: "Always Together · Seattle, WA · February 14, 2024",
    faqs: [
      {
        question: "Is this good for long‑distance couples?",
        answer: "Yes. A shared sky moment makes a meaningful, personal gift.",
      },
      {
        question: "Can I add a custom message?",
        answer: "You can add a dedication line and custom text.",
      },
      {
        question: "Can I include two locations?",
        answer: "Use the location that matches the sky you want, and include both cities in the custom text.",
      },
    ],
  },
  {
    slug: "retirement",
    label: "Retirement",
    seoTitle: "Retirement Star Map Gift — Milestone Night Sky | StarMapCo",
    seoH1: "Retirement Star Map Gift",
    seoDescription:
      "Mark retirement with a personalized star map from the final day or celebration night. Free preview, then framed + HD, poster, or instant HD download.",
    intro: "Mark a retirement with a star map from the final day or a celebratory date.",
    exampleLine: "Cheers to Retirement · Phoenix, AZ · June 30, 2024",
    faqs: [
      {
        question: "Is this suitable for retirement gifts?",
        answer: "Yes. It’s a unique way to commemorate a major milestone.",
      },
      {
        question: "Can I include names and a message?",
        answer: "Add names, dates, and a short dedication before downloading.",
      },
    ],
  },
  {
    slug: "valentines-day",
    label: "Valentine’s Day",
    seoTitle: "Valentine's Day Star Map Gift — Romantic Night Sky | StarMapCo",
    seoH1: "Valentine's Day Star Map Gift",
    seoDescription:
      "The real night sky from the night you met, a first date, or February 14 itself — as a framed print, poster, canvas, mug or HD file. Free preview, no account. HD from $9.",
    intro:
      "The sky from the night you met, the first date, or Valentine’s night itself — the real stars over that place, on that date, rendered from astronomy data. Preview free, no account.",
    detail:
      "Common choices are the night you met, the first date, or February 14 from the year it mattered most. Add both names and a short line in the editor — the words under the stars are yours. Exact time is optional: date plus city still produces an accurate sky, and adding the time sharpens Moon and planet placement.",
    exampleLine: "Valentine’s Night · Toronto, ON · February 14, 2026",
    storyHeading: "The night it started, on the wall",
    storyParagraphs: [
      "Most Valentine’s gifts could be given to anyone. A star map can only belong to one person: it shows the actual night sky over the place where your story started, on the date it happened — the night you met, the night of the first date, or a February 14 that still matters. It is rendered from real astronomy data for that date and place, so it can be checked, not just admired.",
      "Choosing the date is the whole gift, and it is worth taking a minute over: the city, the date, and the time if you remember it. The time is optional — date plus city still produces an accurate sky — but adding it places the Moon and planets exactly where they stood. Then add both names and a line of your own. A few words from that night beat a long inscription.",
      "For a wall-ready gift, framed print + HD digital is the recommended route: the print arrives ready to hang and the HD file is yours to keep. Unframed posters are $39–$49, canvas and mugs carry the same design, and the keepsake card is a $19 card-sized version of the same design. If you want one for each of you, a second copy of the same design is 10% off on posters, canvas and framed prints.",
      "Distance does not have to decide the gift. If you are apart this February, the HD digital file is available to download right after checkout, so the same sky can be on their screen the day you send it — and a print can follow to either address. Use the place and date of the night that matters most to you both.",
      "There is no need to decide before you see it. The preview is free and needs no account, so you can try the night you met and the first date side by side, check the spelling of every name, and order only when it looks right. Couples often come back for the same design in a new style on an anniversary — the sky does not change, even as the years add up.",
    ],
    storyCtaHref:
      "/editor?mode=quick&source=occasion-valentines-day-story-preview&utm_source=site&utm_medium=landing&utm_campaign=valentines-day_story",
    storyCtaLabel: "Start free preview",
    artwork: [
      {
        src: "/examples/example-valentines-toronto-2026.webp",
        alt: "Star map example — the real night sky over Toronto, Ontario, on Valentine's night, February 14, 2026",
      },
      {
        src: "/examples/example-valentines-yellowknife.webp",
        alt: "Star map example — the real night sky over Yellowknife, Northwest Territories, on January 16, 2027, a mid-winter sky weeks before Valentine's Day",
      },
    ],
    faqs: [
      {
        question: "Is a star map a good Valentine’s Day gift?",
        answer:
          "Yes. It shows the real night sky from a date that belongs to the two of you — the night you met, a first date, or February 14 itself — rendered from astronomy data for that date and place. It is personal in a way a generic Valentine’s gift cannot be.",
      },
      {
        question: "Which date should I use?",
        answer:
          "Common choices are the night you met, the first date, and the first Valentine’s Day you spent together. Any date that matters works — the map is rendered from the astronomy data for that date, over the place you choose.",
      },
      {
        question: "Do I need the exact time of night?",
        answer:
          "No. Date plus city still produces an accurate, beautiful sky. Add the time if you remember it and Moon and planet placement will be precise to that hour.",
      },
      {
        question: "What can I write on the map?",
        answer:
          "Add both names, a title, and a short dedication line in the editor before checkout. The same design can be ordered as a framed print, unframed poster, canvas, mug, keepsake card, or HD digital file.",
      },
      {
        question: "Which format fits Valentine’s Day best?",
        answer:
          "Framed print + HD digital ($106) is the wall-ready route: ready to hang, with the HD file included. Unframed posters are $39–$49, the keepsake card is $19, and the HD file on its own starts at $9. A second copy of the same design is 10% off on posters, canvas, and framed prints.",
      },
      {
        question: "We are long-distance. Can I still give one?",
        answer:
          "Yes. Use the date and place of the night that matters to you both. The HD digital file is available to download right after checkout, so distance does not decide whether the gift arrives — and a print can be shipped to either of you.",
      },
      {
        question: "Will a print arrive by February 14?",
        answer:
          "Check the shipping page for the current Valentine’s order-by dates before relying on a specific delivery date — print orders of $89 or more ship free. The free preview lets you design yours now, and the HD file is there if you leave it late.",
      },
    ],
  },
  {
    slug: "mothers-day",
    label: "Mother’s Day",
    seoTitle: "Mother's Day Star Map Gift — Personalized Night Sky | StarMapCo",
    seoH1: "Mother's Day Star Map Gift",
    seoDescription:
      "Give mom a personalized star map from a meaningful date — birth date, anniversary, or Mother's Day itself. Free preview, framed + HD, poster, or instant HD.",
    intro: "Honor mom with a star map from a meaningful date—birthdays, anniversaries, or family milestones.",
    detail:
      "Common date ideas include a child’s birth date or a family milestone. Add multiple names and a short dedication to personalize the print.",
    exampleLine: "For Mom · San Diego, CA · May 12, 2024",
    faqs: [
      {
        question: "Is a star map a good Mother’s Day gift?",
        answer: "Yes. It’s personal, thoughtful, and easy to customize with names and dates.",
      },
      {
        question: "Can I add multiple names?",
        answer: "Yes. Add names and a short dedication in the editor.",
      },
      {
        question: "Can I use a date other than Mother’s Day?",
        answer: "Yes. Any meaningful family date works great.",
      },
    ],
  },
  {
    slug: "anniversary",
    label: "Anniversary",
    intro:
      "Celebrate your anniversary with a star map that captures the exact night sky from your special date.",
    detail:
      "Common date ideas include your wedding date, first date, or the night you first met. Include names and a short line to make it feel like a framed vow.",
    exampleLine: "Our Anniversary · Napa Valley, CA · September 12, 2019",
    faqs: [
      {
        question: "Is a star map a good anniversary gift?",
        answer:
          "Yes. A star map captures the exact sky from your anniversary date and makes a meaningful keepsake.",
      },
      {
        question: "Can I use any anniversary date?",
        answer: "Yes. Enter the date and location that matter most to you.",
      },
      {
        question: "Can I use the date we first met?",
        answer: "Absolutely. Any meaningful date works, not just the wedding date.",
      },
    ],
  },
  {
    slug: "wedding",
    label: "Wedding",
    intro: "Create a wedding star map that captures the exact sky from your wedding night or ceremony date.",
    detail:
      "Use the ceremony date, reception night, or even the proposal date. Adding the venue city and your names makes the print feel like part of the celebration.",
    exampleLine: "The Wedding · Santorini, Greece · June 21, 2024",
    faqs: [
      {
        question: "Is a wedding star map a good gift?",
        answer:
          "Yes. It captures the exact sky from the ceremony date and place, then ships as framed print, unframed poster, or instant HD.",
      },
      {
        question: "Can I add names and venue?",
        answer: "You can customize the text with names, date, and location before downloading.",
      },
      {
        question: "Can I use the reception time instead of ceremony time?",
        answer: "Yes. Choose any time that matches the moment you want to remember.",
      },
    ],
  },
  {
    slug: "birthday",
    label: "Birthday",
    intro:
      "Gift a birthday star map that shows the exact sky from a birth date or a special birthday celebration.",
    detail:
      "Birthday maps work especially well for milestone years. Use the birth location or the place where the party happened.",
    exampleLine: "Happy Birthday · Tokyo, Japan · July 7, 1995",
    faqs: [
      {
        question: "Is a star map good for birthdays?",
        answer:
          "Yes. It’s a personal way to commemorate the exact night sky from a birth date or milestone birthday.",
      },
      {
        question: "Can I include the birth location?",
        answer: "Yes. Enter the birth location or any place that matters.",
      },
      {
        question: "Do I need the exact birth time?",
        answer: "Exact time is optional, but it makes the sky even more precise.",
      },
    ],
  },
  {
    slug: "baby-shower",
    label: "Baby Shower",
    intro: "Celebrate a baby shower with a star map that captures the sky on a meaningful date.",
    exampleLine: "Baby Shower · Chicago, IL · April 6, 2024",
    faqs: [
      {
        question: "Is a star map a good baby shower gift?",
        answer: "Yes. It’s a unique, personal gift that parents can treasure.",
      },
      {
        question: "Can I use the due date instead?",
        answer: "You can choose any date and location that matter most.",
      },
    ],
  },
  {
    slug: "housewarming",
    label: "Housewarming",
    intro: "Mark a new home with a star map from the move‑in date or closing day.",
    exampleLine: "Our New Home · Raleigh, NC · October 8, 2023",
    faqs: [
      {
        question: "Is this good for housewarming gifts?",
        answer: "Yes. A star map is a thoughtful way to commemorate a new home milestone.",
      },
      {
        question: "Can I include the address?",
        answer: "You can use the city or exact location for the map’s sky calculation.",
      },
    ],
  },
  {
    slug: "baptism",
    label: "Baptism",
    intro: "Commemorate a baptism with a star map that captures the sky from the ceremony date.",
    exampleLine: "Baptism · Boston, MA · June 2, 2024",
    faqs: [
      {
        question: "Is a star map appropriate for a baptism?",
        answer: "Yes. It’s a meaningful keepsake for a religious milestone.",
      },
      {
        question: "Can I add a dedication?",
        answer: "Yes. Add a short message, names, and the date.",
      },
    ],
  },
  {
    slug: "bar-mitzvah",
    label: "Bar Mitzvah",
    intro: "Celebrate a bar mitzvah with a star map that captures the sky from the ceremony date.",
    exampleLine: "Bar Mitzvah · Miami, FL · March 9, 2024",
    faqs: [
      {
        question: "Is a star map a good bar mitzvah gift?",
        answer: "Yes. It’s a personalized gift tied to the ceremony date and location.",
      },
      {
        question: "Can I add Hebrew text?",
        answer: "You can customize text in the editor, including non‑English characters.",
      },
    ],
  },
  {
    slug: "bat-mitzvah",
    label: "Bat Mitzvah",
    intro: "Create a bat mitzvah star map as a memorable keepsake for the ceremony date.",
    exampleLine: "Bat Mitzvah · Los Angeles, CA · May 18, 2024",
    faqs: [
      {
        question: "Is a bat mitzvah star map unique?",
        answer: "Yes. It’s a thoughtful keepsake with the exact sky from the ceremony date.",
      },
      {
        question: "Can I personalize the dedication?",
        answer: "You can add names, date, and a dedication line before download.",
      },
    ],
  },
  {
    slug: "sweet-16",
    label: "Sweet 16",
    intro: "Celebrate a Sweet 16 with a star map from the birthday date or party night.",
    exampleLine: "Sweet 16 · Dallas, TX · August 16, 2023",
    faqs: [
      {
        question: "Is a star map fun for Sweet 16 gifts?",
        answer: "Yes. It’s a unique, personalized gift that stands out from typical presents.",
      },
      {
        question: "Can I use the party date?",
        answer: "Yes. Use any date and location you want to capture.",
      },
    ],
  },
  {
    slug: "quinceanera",
    label: "Quinceañera",
    intro: "Honor a quinceañera with a star map that captures the sky from the celebration date.",
    exampleLine: "Quinceañera · San Antonio, TX · September 14, 2024",
    faqs: [
      {
        question: "Is a star map good for quinceañera gifts?",
        answer: "Yes. It’s a meaningful, personalized keepsake for a major milestone.",
      },
      {
        question: "Can I include names and the venue?",
        answer: "You can add names, date, and a custom location line.",
      },
    ],
  },
  {
    slug: "night-we-met",
    label: "Night We Met",
    seoTitle: "Night We Met Star Map — Custom Star Map of Where You Met | StarMapCo",
    seoH1: "Night We Met Star Map",
    seoDescription:
      "A custom star map of the sky over where you met, on the night it happened — by date and location. Free preview, no account. Framed print, poster, canvas or HD file; HD from $9.",
    intro:
      "The real stars over where you met, on the night it happened — rendered from astronomy data for that date and place. Preview free, no account.",
    detail:
      "Start with the place where you met and the date, as close as you can get it — a photo’s date stamp, the first message in a thread, a ticket stub. The exact time is optional: date plus city still produces an accurate sky, and adding the time sharpens Moon and planet placement. If you met during the day, use the evening of the same date — the first night sky after you met.",
    exampleLine: "The Night We Met · Vancouver, BC · August 16, 2025",
    storyHeading: "It began on an ordinary night",
    storyParagraphs: [
      "Nobody plans the night they meet the person. It is usually an ordinary evening — a friend’s party, a delayed train, the wrong coffee order — and only later does it become the night everything started. A night we met star map takes that one night seriously: the real sky over where you met, on that date, rendered from astronomy data and printed as a framed keepsake for the wall.",
      "Most people remember where they met more clearly than when, so start there: the city, and the place itself if it fits the line under the stars. For the date, work backwards from the anchors you already have — the date stamp on an early photo, the first message in your chat thread, a concert or match ticket, the receipt you kept for no reason. If the exact time is gone, it is not a problem: choose the evening hour closest to how you remember it. Date and city carry the sky; the time mainly sharpens where the Moon and planets sit.",
      "If you met in daylight — a morning class, a lunchtime shift, a Saturday game — use the evening of that same date. The map then shows the first night sky that arrived after you met, which is the one couples usually mean when they picture that day. And if the meeting and the first date blur together in your memory, they are different nights and different maps: this page is the meeting. A first date has its own page, and an anniversary marks the milestone you celebrate every year.",
      "The words matter as much as the sky. A clear title (The Night We Met), both names, and the place where you met carry most of it; the dedication line is better short — a few words from that night, an inside joke, the first thing one of you said. You can check every spelling in the free preview before anything is made, and try the meeting night and the first date side by side if you are deciding between them.",
      "As a gift, the framed print + HD digital route ($106) is the wall-ready one: it arrives ready to hang, and the HD file is yours to keep. Unframed posters are $39–$49, canvas is $79, and if you want one for each of you, a second copy of the same design is 10% off on posters, canvas and framed prints. The keepsake card is a $19 card-sized version of the same design, and the HD file on its own is $9 — available to download right after checkout if the occasion cannot wait for a print.",
    ],
    storyCtaHref:
      "/editor?mode=quick&source=occasion-night-we-met-story-preview&utm_source=site&utm_medium=landing&utm_campaign=night-we-met_story",
    storyCtaLabel: "Start free preview",
    artwork: [
      {
        src: "/examples/example-night-we-met-vancouver-2025.webp",
        alt: "Star map example — the real night sky over Vancouver, British Columbia, on the night of August 16, 2025",
      },
      {
        src: "/examples/example-night-we-met-millennium-new-york.webp",
        alt: "Star map example — the night sky over New York on December 31, 1999, the last night of the millennium",
      },
      {
        src: "/examples/example-night-we-met-apollo-houston.webp",
        alt: "Star map example — the night sky over Houston, Texas, on July 20, 1969, the night of the first Moon landing",
      },
    ],
    faqs: [
      {
        question: "What is a night we met star map?",
        answer:
          "It is a custom star map showing the real night sky over where you met, on the date you met, rendered from astronomy data for that date and place. You build the design and wording in a free preview, then order it as a framed print, unframed poster, canvas, mug, keepsake card, or HD digital file.",
      },
      {
        question: "We don’t remember the exact time we met. Does that matter?",
        answer:
          "No. Date plus city still produces an accurate sky — the date and the place where you met are enough. If you remember roughly when it was, choose the closest evening hour: adding the exact time makes Moon and planet placement precise to that hour.",
      },
      {
        question: "We met during the day. Which sky does the map show?",
        answer:
          "Use the date you met, with an evening time. The map then shows the first night sky over that place after you met — the night that followed the day everything started. The same approach works for morning or afternoon meetings.",
      },
      {
        question: "How do I work out the date we met?",
        answer:
          "Work backwards from things that carry dates: the timestamp on an early photo, the first message in a chat or text thread, a ticket, booking or bank record from that day, or a friend who was there. The preview is free, so you can try the most likely date and adjust it as often as you like before ordering.",
      },
      {
        question: "Is this the same as a first date star map?",
        answer:
          "No — they are two different nights. This page is the night you first met, planned or not. If the night you want to keep was your first actual date, the First Date page (/star-map-for/first-date) is the better fit. For the milestone you celebrate each year, the Anniversary page (/anniversary) covers wedding and relationship anniversaries.",
      },
      {
        question: "What can I write on the map?",
        answer:
          "Add a title, both names, the place where you met, the date line, and a short dedication in the editor. Short lines work best — a few words from that night beat a paragraph — and you can check every word in the free preview before you order.",
      },
      {
        question: "Which format works best as a gift?",
        answer:
          "Framed print + HD digital ($106) is the wall-ready route: ready to hang, with the HD file included, and print orders of $89 or more ship free. Unframed posters are $39–$49 and canvas is $79; a second copy of the same design is 10% off on posters, canvas and framed prints. The keepsake card is $19, and the HD file on its own is $9.",
      },
    ],
  },
  {
    slug: "first-date",
    label: "First Date",
    seoTitle: "First Date Star Map Gift — Custom Night Sky | StarMapCo",
    seoH1: "First Date Star Map Gift",
    seoDescription:
      "Remember your first date with a custom star map from that night and place. Free preview, then framed print, poster, or instant HD for a romantic keepsake.",
    intro: "Remember your first date with a star map of the night sky from that exact evening.",
    exampleLine: "Our First Date · Seattle, WA · November 3, 2018",
    faqs: [
      {
        question: "Is a first date star map romantic?",
        answer: "Yes. It’s a thoughtful way to capture a meaningful moment in your relationship.",
      },
      {
        question: "Can I choose any date and place?",
        answer: "Yes. Use the date and location that matter most.",
      },
    ],
  },
  {
    slug: "first-kiss",
    label: "First Kiss",
    intro: "Celebrate your first kiss with a star map that captures the sky from that night.",
    exampleLine: "Our First Kiss · Paris, France · July 22, 2017",
    faqs: [
      {
        question: "Is this a good romantic gift?",
        answer: "Yes. A first kiss star map is a unique, personal gift for partners.",
      },
      {
        question: "Can I include a short message?",
        answer: "You can add a dedication line in the editor.",
      },
    ],
  },
  {
    slug: "first-anniversary",
    label: "First Anniversary",
    intro: "Mark your first anniversary with a star map from the wedding date or celebration night.",
    exampleLine: "First Anniversary · Austin, TX · June 21, 2025",
    faqs: [
      {
        question: "Is a first anniversary star map special?",
        answer: "Yes. It captures a meaningful milestone with the exact night sky.",
      },
      {
        question: "Can I use the wedding date?",
        answer: "You can choose any date you want to commemorate.",
      },
    ],
  },
  {
    slug: "christmas",
    label: "Christmas",
    seoTitle: "Christmas Star Map Gift | Personalized | StarMapCo",
    seoH1: "Christmas Star Map Gift",
    seoDescription:
      "A personalized star map for Christmas: the sky from a wedding, a birth or a first Christmas together. Free preview. Instant HD from $9.",
    intro:
      "A gift that is only theirs: the sky from the night you met, a wedding, a birth, or your first Christmas together. Preview free, no account.",
    exampleLine: "Christmas Night · New York, NY · December 25, 2023",
    storyHeading: "One idea, a different gift for everyone on your list",
    storyParagraphs: [
      "Christmas shopping has a way of becoming a list of things nobody asked for. A personalized star map is one of the few gifts that is about the person receiving it rather than the store selling it. It shows the night sky from a date that matters to them, framed and ready to hang, and it is very hard to buy the same one twice.",
      "Think about who is on your list. For a partner, choose the night you met or your wedding date. For parents, choose their wedding date or the day they brought you home. For a new family, the baby's birth night. For a couple celebrating their first Christmas together, the night they moved in. Each one becomes a different gift from the same idea.",
      "Some people use Christmas itself as the date: the sky on Christmas Eve over the family home, or the first Christmas in a new house. Add a title like Our First Christmas and the town name, and it becomes a keepsake you can bring out every December.",
      "Holiday timing matters for physical gifts, so start early. The StarMapCo preview is free and needs no account, so you can design several maps for different people in one sitting and decide later. Framed and unframed prints are shipped to you; check the shipping page for current timing before relying on a specific delivery date.",
      "If you leave it late, the digital option is there. You can download the file and print it locally, or slip a printed copy into a card on Christmas morning. Either way, it is a gift that took thought, and that shows.",
    ],
    storyCtaHref:
      "/editor?mode=quick&source=occasion-christmas-story-preview&utm_source=site&utm_medium=landing&utm_campaign=christmas_story",
    storyCtaLabel: "Start free preview",
    artwork: [
      {
        src: "/home-mockups/gallery-living-room-framed.png",
        alt: "Framed star map in a living room holiday setting",
        aspect: "4:3",
      },
      {
        src: "/home-mockups/gallery-framed-light-wood.png",
        alt: "Framed star map with light wood frame mockup",
      },
      {
        src: "/home-mockups/offer-framed-print.png",
        alt: "Framed star map print product mockup",
        aspect: "16:9",
      },
      {
        src: "/home-mockups/offer-digital-hd.png",
        alt: "Digital HD star map mockup for last-minute Christmas gifts",
        aspect: "4:3",
      },
    ],
    faqs: [
      {
        question: "Is this a good Christmas gift?",
        answer: "Yes. Star maps are personal and stand out during the holidays.",
      },
      {
        question: "Can I use any holiday date?",
        answer: "Yes. Pick the date that matters most to your family.",
      },
      {
        question: "What if it is too late for a print to arrive?",
        answer:
          "Choose the digital file. It can be printed locally or presented in a card on Christmas morning.",
      },
      {
        question: "What dates make a good Christmas star map?",
        answer:
          "Popular choices are a wedding date, the night a couple met, a child's birth, or Christmas Eve over the family home.",
      },
      {
        question: "Can I make several maps for different people?",
        answer:
          "Yes. The preview is free, so you can design one for each person before deciding which to order.",
      },
    ],
  },
  {
    slug: "new-year",
    label: "New Year",
    intro: "Celebrate New Year’s with a star map that captures the sky from a memorable night.",
    exampleLine: "New Year’s Eve · Sydney, AU · December 31, 2024",
    faqs: [
      {
        question: "Is a New Year star map meaningful?",
        answer: "Yes. It captures a once‑a‑year moment and makes a great gift.",
      },
      {
        question: "Can I use New Year’s Eve or Day?",
        answer: "Yes. Use any time and location you want to memorialize.",
      },
    ],
  },
  {
    slug: "moving-away",
    label: "Moving Away",
    intro: "Commemorate a move with a star map from your last night or farewell date.",
    exampleLine: "Until We Meet Again · San Francisco, CA · August 15, 2023",
    faqs: [
      {
        question: "Is this good for a farewell gift?",
        answer: "Yes. It’s a heartfelt way to remember a place and time.",
      },
      {
        question: "Can I include a message?",
        answer: "You can add a dedication line before downloading.",
      },
    ],
  },
  {
    slug: "promotion",
    label: "Promotion",
    intro: "Celebrate a promotion with a star map from the day it happened.",
    exampleLine: "Promotion Day · Atlanta, GA · October 3, 2024",
    faqs: [
      {
        question: "Is a star map a good promotion gift?",
        answer: "Yes. It’s a unique way to mark a career milestone.",
      },
      {
        question: "Can I add a title or role?",
        answer: "You can customize the text with any title or message.",
      },
    ],
  },
  {
    slug: "team-win",
    label: "Team Win",
    intro: "Celebrate a team win or championship with a star map of the victory night.",
    exampleLine: "Championship Night · Miami, FL · June 7, 2024",
    faqs: [
      {
        question: "Is this good for sports teams?",
        answer: "Yes. It’s a creative keepsake for a big win.",
      },
      {
        question: "Can I add team names?",
        answer: "You can customize the text with team names and dates.",
      },
    ],
  },
  {
    slug: "milestone-birthday",
    label: "Milestone Birthday",
    intro: "Mark a 30th, 40th, or 50th birthday with a star map from the celebration night.",
    exampleLine: "40th Birthday · Orlando, FL · April 12, 2024",
    faqs: [
      {
        question: "Is this good for milestone birthdays?",
        answer: "Yes. It’s a meaningful way to commemorate a big birthday.",
      },
      {
        question: "Can I use a specific party date?",
        answer: "Yes. Use the date that matters most.",
      },
    ],
  },
  {
    slug: "pet-memorial",
    label: "Pet Memorial",
    intro: "Honor a beloved pet with a memorial star map tied to a meaningful date.",
    exampleLine: "In Loving Memory · Denver, CO · March 2, 2022",
    faqs: [
      {
        question: "Is a pet memorial star map appropriate?",
        answer: "Yes. It’s a gentle way to remember a pet and a special date.",
      },
      {
        question: "Can I add my pet’s name?",
        answer: "You can add names and a dedication line before download.",
      },
    ],
  },
  {
    slug: "friendship",
    label: "Friendship",
    intro: "Celebrate friendship with a star map that captures a shared date and place.",
    exampleLine: "Best Friends · Nashville, TN · July 4, 2021",
    faqs: [
      {
        question: "Is a star map good for a friend?",
        answer: "Yes. It’s a unique and thoughtful gift for close friends.",
      },
      {
        question: "Can I customize the message?",
        answer: "You can add a personal dedication line before downloading.",
      },
    ],
  },
  {
    slug: "fathers-day",
    label: "Father's Day",
    seoTitle: "Father's Day Star Map Gift — Personalized Night Sky | StarMapCo",
    seoH1: "Father's Day Star Map Gift",
    seoDescription:
      "Celebrate Dad with a personalized star map from a meaningful family date and place. Free preview, framed + HD, poster, or instant HD download.",
    intro: "Celebrate Dad with a star map that captures a meaningful family date and location.",
    exampleLine: "For Dad · Portland, OR · June 16, 2019",
    faqs: [
      {
        question: "Is a star map a good Father's Day gift?",
        answer: "Yes. It’s personal, thoughtful, and tied to a date that matters to your family.",
      },
      {
        question: "Can I use any date instead of Father's Day?",
        answer: "Yes. Use a birthday, anniversary, or any memorable moment.",
      },
    ],
  },
  {
    slug: "grandparents-day",
    label: "Grandparents Day",
    intro: "Honor grandparents with a star map from a family milestone or shared celebration.",
    exampleLine: "For Grandma & Grandpa · Omaha, NE · September 8, 2024",
    faqs: [
      {
        question: "Is this a good Grandparents Day gift?",
        answer: "Yes. It’s a unique keepsake that celebrates family history and milestones.",
      },
      {
        question: "Can I include multiple names?",
        answer: "Yes. Add multiple names and a short dedication in the editor.",
      },
    ],
  },
  {
    slug: "bridal-shower",
    label: "Bridal Shower",
    intro: "Create a bridal shower star map that captures the sky from the celebration date.",
    exampleLine: "Bridal Shower · Charleston, SC · April 20, 2024",
    faqs: [
      {
        question: "Is a star map a good bridal shower gift?",
        answer: "Yes. It’s a personal, elegant gift that feels unique to the couple.",
      },
      {
        question: "Can I add the couple’s names?",
        answer: "Yes. Customize the text with names and a special message.",
      },
    ],
  },
  {
    slug: "engagement-party",
    label: "Engagement Party",
    intro: "Capture the engagement party night with a star map that matches the exact sky.",
    exampleLine: "Engagement Party · Scottsdale, AZ · August 10, 2024",
    faqs: [
      {
        question: "Is this different from an engagement star map?",
        answer: "Yes. It focuses on the party date, while engagement maps focus on the proposal date.",
      },
      {
        question: "Can I customize the event name?",
        answer: "Yes. Edit the title to match your celebration.",
      },
    ],
  },
  {
    slug: "adoption-day",
    label: "Adoption Day",
    intro: "Celebrate adoption day (or gotcha day) with a star map from that special moment.",
    exampleLine: "Adoption Day · Minneapolis, MN · November 12, 2022",
    faqs: [
      {
        question: "Is this appropriate for adoption day?",
        answer: "Yes. It’s a meaningful way to honor a life-changing family milestone.",
      },
      {
        question: "Can I include a child’s name?",
        answer: "Yes. Add names and a dedication line before downloading.",
      },
    ],
  },
  {
    slug: "first-birthday",
    label: "First Birthday",
    intro: "Celebrate a first birthday with a star map from the birth date or party night.",
    exampleLine: "First Birthday · Tampa, FL · July 1, 2024",
    faqs: [
      {
        question: "Can I use the birth date or party date?",
        answer: "Yes. Choose the date and location that mean the most to you.",
      },
      {
        question: "Is this a good first birthday gift?",
        answer: "Yes. It’s a sentimental keepsake parents can treasure.",
      },
    ],
  },
  {
    slug: "work-anniversary",
    label: "Work Anniversary",
    intro: "Mark a work anniversary with a star map from the milestone date.",
    exampleLine: "Work Anniversary · Seattle, WA · March 5, 2024",
    faqs: [
      {
        question: "Is a star map good for a coworker?",
        answer: "Yes. It’s a thoughtful, professional gift for a career milestone.",
      },
      {
        question: "Can I include a company name or role?",
        answer: "Yes. Add a title, company name, or custom line in the editor.",
      },
    ],
  },
  {
    slug: "new-job",
    label: "New Job",
    intro: "Celebrate a new job with a star map from the first day or offer date.",
    exampleLine: "New Job · Denver, CO · October 2, 2023",
    faqs: [
      {
        question: "Is this good for a new job gift?",
        answer: "Yes. It’s a unique way to mark a fresh start and career milestone.",
      },
      {
        question: "Can I use the first day date?",
        answer: "Yes. Use the first day, offer date, or any meaningful moment.",
      },
    ],
  },
  {
    slug: "family-reunion",
    label: "Family Reunion",
    intro: "Remember a family reunion with a star map from the gathering night.",
    exampleLine: "Family Reunion · Asheville, NC · July 20, 2024",
    faqs: [
      {
        question: "Is this good for a family reunion gift?",
        answer: "Yes. It’s a unique keepsake that celebrates time together.",
      },
      {
        question: "Can I include family names?",
        answer: "Yes. Add names or a family dedication line.",
      },
    ],
  },
  {
    slug: "travel-memory",
    label: "Travel Memory",
    intro: "Capture a favorite trip with a star map from the night you were there.",
    exampleLine: "Paris Trip · Paris, France · May 9, 2023",
    faqs: [
      {
        question: "Can I make a star map from a vacation?",
        answer: "Yes. Use the date and location from any trip you want to remember.",
      },
      {
        question: "Is this good for couples travel gifts?",
        answer: "Yes. It’s a romantic way to remember a shared adventure.",
      },
    ],
  },
  {
    slug: "military-homecoming",
    label: "Military Homecoming",
    intro: "Celebrate a homecoming with a star map from the night they returned.",
    exampleLine: "Welcome Home · Norfolk, VA · January 18, 2024",
    faqs: [
      {
        question: "Is this a good military homecoming gift?",
        answer: "Yes. It’s a meaningful way to commemorate a long-awaited return.",
      },
      {
        question: "Can I add a unit name or message?",
        answer: "Yes. Customize the text with a unit, rank, or personal note.",
      },
    ],
  },
  {
    slug: "teacher-appreciation",
    label: "Teacher Appreciation",
    intro: "Thank a teacher with a star map that celebrates a memorable school year.",
    exampleLine: "Thank You · Austin, TX · May 24, 2024",
    faqs: [
      {
        question: "Is a star map good for teacher appreciation?",
        answer: "Yes. It’s a thoughtful gift that feels personal and unique.",
      },
      {
        question: "Can I add a student name or class year?",
        answer: "Yes. Add names, a class year, or a short message.",
      },
    ],
  },
  {
    slug: "house-anniversary",
    label: "House Anniversary",
    intro: "Celebrate a home anniversary with a star map from move-in day or closing.",
    exampleLine: "Home Anniversary · Denver, CO · September 2, 2023",
    faqs: [
      {
        question: "Is this good for a home anniversary?",
        answer: "Yes. It’s a meaningful keepsake for a home milestone.",
      },
      {
        question: "Can I use a different date?",
        answer: "Yes. Use any date that marks your time in the home.",
      },
    ],
  },
];

export function getOccasion(slug: string) {
  return seoOccasions.find((item) => item.slug === slug);
}
