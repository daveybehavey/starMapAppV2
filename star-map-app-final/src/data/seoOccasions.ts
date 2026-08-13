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
};

export const seoOccasions: SeoOccasion[] = [
  {
    slug: "engagement",
    label: "Engagement",
    seoTitle: "Engagement Star Map Gift — Proposal Night Sky | StarMapCo",
    seoH1: "Engagement Star Map Gift",
    seoDescription:
      "Create a personalized engagement star map from the proposal date and place. Free preview, then framed + HD digital (free shipping $100+), unframed poster, or instant HD for same-night gifts.",
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
    seoTitle: "New Baby Star Map Gift — Birth Night Sky | StarMapCo",
    seoH1: "New Baby Star Map Gift",
    seoDescription:
      "Create a personalized new baby star map from their birth date, time, and hospital or home city. Free preview, then framed + HD digital with free shipping on $100+ orders.",
    intro:
      "Welcome a new baby with a star map that shows the exact night sky from their birth date and location — a nursery-ready keepsake parents treasure for years.",
    detail:
      "Use the birth date and time if you have it, or the first night home. Parents often add the baby’s name, birth weight, and a short welcome line before choosing framed + HD for the nursery wall.",
    exampleLine: "Welcome, Noah · Austin, TX · March 18, 2024",
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
    ],
  },
  {
    slug: "memorial",
    label: "Memorial",
    seoTitle: "Memorial Star Map Gift — Remembrance Night Sky | StarMapCo",
    seoH1: "Memorial Star Map Gift",
    seoDescription:
      "Honor a loved one with a memorial star map from a meaningful date and place. Free preview, then framed print, unframed poster, or instant HD — quiet, respectful personalization.",
    intro: "Honor a loved one with a memorial star map that captures the night sky from a meaningful date.",
    detail:
      "Many families use a birthday, anniversary, or the day of passing. Add a simple dedication line to keep the design quiet and respectful.",
    exampleLine: "In Loving Memory · London, UK · October 9, 2022",
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
    ],
  },
  {
    slug: "graduation",
    label: "Graduation",
    seoTitle: "Graduation Star Map Gift — Ceremony Night Sky | StarMapCo",
    seoH1: "Graduation Star Map Gift",
    seoDescription:
      "Celebrate graduation with a custom star map from the ceremony date and city. Free preview, then framed + HD digital, poster, or instant HD for last-minute gifts.",
    intro: "Celebrate a graduation with a star map from the ceremony date and location.",
    detail:
      "Use the ceremony date or the celebration night. Add the school name, class year, or degree to personalize the print.",
    exampleLine: "Class of 2024 · Boston, MA · May 25, 2024",
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
      "Give a Valentine's Day star map from your special date and place. Free preview, then framed + HD, poster, or instant HD — a personalized romantic gift that ships or downloads fast.",
    intro: "Create a Valentine’s Day star map that captures the sky from a romantic date or anniversary.",
    detail:
      "Use February 14 or any romantic date you want to remember. Pair it with a short message to make the print feel personal and intentional.",
    exampleLine: "Valentine’s Day · Chicago, IL · February 14, 2024",
    faqs: [
      {
        question: "Is a star map romantic enough for Valentine’s Day?",
        answer: "Yes. A personalized sky from a special date is a meaningful Valentine’s gift.",
      },
      {
        question: "Can I choose any date?",
        answer: "Yes. Use Valentine’s Day or any date that matters most.",
      },
      {
        question: "Is this only for couples?",
        answer: "No. Valentine’s star maps are also thoughtful for friends and family.",
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
    seoTitle: "Christmas Star Map Gift — Holiday Night Sky | StarMapCo",
    seoH1: "Christmas Star Map Gift",
    seoDescription:
      "Give a Christmas star map from a holiday memory, proposal, or family gathering. Free preview, then framed + HD, poster, or instant HD for last-minute gifts.",
    intro: "Create a Christmas star map for a holiday memory, proposal, or family gathering.",
    exampleLine: "Christmas Night · New York, NY · December 25, 2023",
    faqs: [
      {
        question: "Is this a good Christmas gift?",
        answer: "Yes. Star maps are personal and stand out during the holidays.",
      },
      {
        question: "Can I use any holiday date?",
        answer: "Yes. Pick the date that matters most to your family.",
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
