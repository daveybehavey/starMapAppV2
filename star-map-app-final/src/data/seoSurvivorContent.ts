/**
 * Differentiated content for the five surviving city pages (KEEP — differentiate
 * in the city-pages disposition, adopted standard B.1–B.8).
 *
 * Every sky fact below (sunset/twilight times, Moon phase and position, planet
 * positions, the 2024-09-17 partial lunar eclipse peak) was calculated for the
 * stated coordinates with astronomy-engine — the same library that renders
 * StarMapCo maps — and is recorded in the page's `sources` lines. Seasonal
 * context (Perseid peak, full-moon names) is attributed in the same lines.
 */

export type SeoSurvivorContent = {
  slug: string;
  /** The page's own <title> — not the shared `Star Map in {display}` template. */
  title: string;
  /** The page's own H1. */
  heading: string;
  metaDescription: string;
  /** Hero paragraph under the H1. */
  intro: string;
  /** B.1 — a distinct, city-grounded buying/commemorative use case. */
  useCase: { heading: string; paragraphs: string[] };
  /** B.2 — one accurate worked example: real place + real date + what the sky showed. */
  example: {
    heading: string;
    place: string;
    /** The example's real date; retires the old shared example-date line. */
    dateLine: string;
    paragraphs: string[];
    /** Caption suggested for the final print, rendered by the Example caption module. */
    caption: string;
  };
  /** B.3 — local guidance that changes a customer's choice or input, with sources. */
  guidance: { heading: string; points: { lead: string; text: string }[]; sources: string[] };
  /** B.4 — regional coverage statement (must be live before survivor-bound 301s). */
  coverage: { heading: string; paragraphs: string[] };
  /** One survivor-specific FAQ entry (typically the coverage question). */
  faq: { question: string; answer: string };
};

export const SEO_SURVIVOR_CONTENT: Record<string, SeoSurvivorContent> = {
  "vancouver-bc": {
    slug: "vancouver-bc",
    title: "Vancouver Star Map — Your Night Over English Bay | StarMapCo",
    heading: "A star map for your Vancouver night",
    metaDescription:
      "Create a custom star map of a Vancouver moment — a first date at Kitsilano, an anniversary over English Bay. Calculated for your exact date, time and place, with a free preview.",
    intro:
      "Vancouver moments happen under big western skies: sunset walks at Kitsilano Beach, anniversaries above English Bay, June evenings that stay bright long after dinner. Your map is calculated for the exact night and place you choose here in the city, then printed or delivered in HD from the same design.",
    useCase: {
      heading: "Made for the night you met on the water",
      paragraphs: [
        "Vancouver's classic evening is a shoreline one: a first date that turns into a walk along Kits Beach, an anniversary dinner that ends above English Bay, a blanket at Spanish Banks while the light goes down over the Salish Sea. Those are the moments this page is for — the night the two of you were on the water, fixed as the sky that was actually over it.",
        "StarMapCo is based on Vancouver Island, just across the strait. Vancouver is our home market, and this is the sky we know best.",
      ],
    },
    example: {
      heading: "One Vancouver night, exactly as it was",
      place: "Spanish Banks Beach",
      dateLine: "August 12, 2024",
      paragraphs: [
        "On the evening of Monday, August 12, 2024, the Perseid meteor shower reached its annual peak. From Spanish Banks, the Sun set over the water at 8:32 p.m. A half-lit Moon (56% illuminated) hung low in the southwest and set at 11:20 p.m., while full darkness arrived at 10:51 p.m. and Saturn climbed into the east-southeast, well placed by 11:30.",
        "A star map for 10:30 that night shows deep twilight on the edge of full dark — the sky an anniversary walk on that beach actually ended under.",
      ],
      caption: "Spanish Banks Beach, Vancouver, BC · August 12, 2024",
    },
    guidance: {
      heading: "Vancouver sky notes that change what you enter",
      points: [
        {
          lead: "Midsummer nights here never fully darken.",
          text: "Around the June solstice, at Vancouver's latitude of 49.3°N, the Sun bottoms out only 16.8° below the horizon, so true astronomical night never quite arrives. If your moment was a June wedding, its honest sky is a deep-twilight sky. Enter the real time of your moment — the 10 p.m. toast, not midnight by default — and your map will show exactly that sky.",
        },
        {
          lead: "City glow doesn't change your map.",
          text: "Your chart is calculated from astronomical data for your date and place, not photographed. It shows the sky as it truly was over Vancouver that night, whether or not the city lights let anyone see all of it at the time.",
        },
      ],
      sources: [
        "Sky times and positions calculated for Vancouver's coordinates (49.2827°N, 123.1207°W) with the same astronomy engine that renders every StarMapCo map.",
        "Perseid peak date: International Meteor Organization.",
      ],
    },
    coverage: {
      heading: "One page for Western Canada",
      paragraphs: [
        "This page now speaks for Western Canada. If your moment happened in Victoria, Calgary, Edmonton, Kelowna or anywhere else in the West, start here — then enter your actual city or town in the editor.",
        "Your map is always calculated for the exact place and date you enter. A Calgary sky is not a Vancouver sky, and your map will show your place's sky, not this city's.",
      ],
    },
    faq: {
      question: "My moment happened outside Vancouver — in Alberta. Can I still make its map?",
      answer:
        "Yes. Start here, then enter your actual location and date in the editor. Your star map is calculated for the exact place you choose, anywhere in the world.",
    },
  },

  "toronto-on": {
    slug: "toronto-on",
    title: "Toronto Star Map — Your Night Over Lake Ontario | StarMapCo",
    heading: "A star map for your Toronto night",
    metaDescription:
      "Create a custom star map of a Toronto moment — a proposal on the Islands, an anniversary above the skyline. Calculated for your exact date, time and place, with a free preview.",
    intro:
      "Toronto moments come with a skyline and a lake: the ferry to the Islands at dusk, a question asked above the harbour, an anniversary in the ravines. Your map is calculated for the precise night and spot you pick in the city, then printed or delivered in HD from the same design.",
    useCase: {
      heading: "Made for the night you crossed the harbour",
      paragraphs: [
        "The Toronto gesture is the ferry ride: out to the Islands in the late light, the skyline at your back, the open southern sky over Lake Ontario in front of you — and the ride home under a dark sky. Proposals and anniversaries on Centre Island and along the harbour are what this page is for: the night you crossed the harbour, fixed as the sky that was over the water.",
      ],
    },
    example: {
      heading: "One Toronto night, exactly as it was",
      place: "Centre Island, Toronto Islands",
      dateLine: "September 17, 2024",
      paragraphs: [
        "The night of Tuesday, September 17, 2024 brought a full Harvest Moon — and a partial lunar eclipse. From Centre Island, with full darkness by 9:03 p.m., the Moon stood about a third of the way up the southeastern sky over the lake when the eclipse peaked at 10:44 p.m., Earth's shadow covering about 4% of its disc. Saturn shone in the same part of the sky, at almost the same height.",
        "A star map for that hour fixes the full Moon and stars exactly where they stood over the water that night — the sky a proposal before the last ferry home actually happened under.",
      ],
      caption: "Centre Island, Toronto, ON · September 17, 2024",
    },
    guidance: {
      heading: "Toronto sky notes that change what you enter",
      points: [
        {
          lead: "On big-sky nights, minutes change the picture.",
          text: "On September 17, 2024 the eclipse peaked at 10:44 p.m. and was over within the hour; the Moon also climbs noticeably across a single evening. Enter the time of your moment, not just the date — a 9 p.m. Toronto sky is not the 11 p.m. sky, and your map is drawn for the exact time you give it.",
        },
        {
          lead: "Confirm the exact spot, not just the city.",
          text: "The editor prefill starts from downtown Toronto's coordinates (43.6532°N, 79.3832°W). For an Islands, Scarborough Bluffs or Humber Bay moment, set the actual spot in the editor before you order — your map is calculated for the coordinates you confirm, not for the city name.",
        },
      ],
      sources: [
        "Sky times, the eclipse peak (10:44 p.m. EDT, about 4% of the Moon's disc) and positions calculated for Toronto's coordinates with the same astronomy engine that renders every StarMapCo map.",
      ],
    },
    coverage: {
      heading: "One page for Eastern Canada",
      paragraphs: [
        "This page now speaks for Eastern Canada. Moments from Ottawa, Montréal and the Atlantic provinces start here. For Montréal: our pages are published in English, and Montréal moments are fully welcome — the editor takes any location you enter.",
        "Wherever your moment happened, enter its actual place and date. An Ottawa sky is not a Toronto sky, and your map will show yours.",
      ],
    },
    faq: {
      question: "My moment was in Montréal — is this the right page?",
      answer:
        "Yes — this page covers Eastern Canada, and Montréal moments start here. Enter Montréal and your date in the editor; your map is calculated for Montréal's exact sky. (Our city pages are currently published in English.)",
    },
  },

  "new-york-ny": {
    slug: "new-york-ny",
    title: "New York Star Map — Your Night Above the Skyline | StarMapCo",
    heading: "A star map for your New York night",
    metaDescription:
      "Create a custom star map of a New York moment — a Central Park proposal, a Brooklyn Bridge Park evening. Calculated for your exact date, time and place, with a free preview.",
    intro:
      "New York compresses a lifetime of moments into single evenings: a question asked in Central Park, a first date above the East River, an anniversary on a rooftop. Your map is calculated for the precise night and spot you choose in the five boroughs, then printed or delivered in HD from the same design.",
    useCase: {
      heading: "Made for the night you asked in the park",
      paragraphs: [
        "New York's proposals happen outdoors: on a Central Park path at dusk, on the Brooklyn Bridge Park lawn with the skyline lit across the water, at the end of a first date that turned into a walk over the Brooklyn Bridge. This page is for those nights — the evening the city was the backdrop, fixed as the sky that was actually over it.",
      ],
    },
    example: {
      heading: "One New York night, exactly as it was",
      place: "Brooklyn Bridge Park",
      dateLine: "October 17, 2024",
      paragraphs: [
        "On Thursday, October 17, 2024, the largest full moon of the year rose over the East River at 6:13 p.m. — two minutes after sunset. By 7:30 it stood clear of the skyline in the east, 99.6% lit and unusually close at about 356,600 km away, with Saturn well up in the southeast.",
        "A star map for that evening shows the moonrise sky a Brooklyn proposal actually got.",
      ],
      caption: "Brooklyn Bridge Park, New York, NY · October 17, 2024",
    },
    guidance: {
      heading: "New York sky notes that change what you enter",
      points: [
        {
          lead: "June evenings stay twilight late.",
          text: "On the longest evenings of the year, full darkness doesn't reach New York until about 10:42 p.m. A 9 p.m. rooftop moment in June was a twilight moment — enter its real time and your map shows the true, not-yet-dark sky of that hour.",
        },
        {
          lead: "Confirm your borough's exact spot.",
          text: "The editor prefill starts from Manhattan's city-centre coordinates (40.7128°N, 74.0060°W). Brooklyn, Queens and the Bronx are close, but confirm your exact spot in the editor before ordering — your map is calculated for the coordinates you confirm.",
        },
      ],
      sources: [
        "Sky times and positions calculated for New York's coordinates with the same astronomy engine that renders every StarMapCo map.",
        "Largest full moon of 2024: NASA's reporting on the October 17, 2024 supermoon.",
      ],
    },
    coverage: {
      heading: "One page for the Northeast",
      paragraphs: [
        "This page now speaks for the U.S. Northeast and New England. If your moment happened in Boston, Washington, Philadelphia or anywhere else in the Northeast, start here — then enter your actual city in the editor.",
        "Your map is always calculated for the exact place and date you give it. A Boston sky is not a New York sky, and your chart will show your place's sky, not this city's.",
      ],
    },
    faq: {
      question: "My moment was in Boston — can I make its map here?",
      answer:
        "Yes. Start on this page, then enter Boston and your date in the editor. Your map is calculated for Boston's exact sky — nothing about it is a New York map with a different label.",
    },
  },

  "los-angeles-ca": {
    slug: "los-angeles-ca",
    title: "Los Angeles Star Map — Your Night Under Griffith Skies | StarMapCo",
    heading: "A star map for your Los Angeles night",
    metaDescription:
      "Create a custom star map of a Los Angeles moment — a first date at Griffith Observatory, an anniversary above the city. Calculated for your exact date, time and place, with a free preview.",
    intro:
      "Los Angeles evenings run long and warm: first dates at the Observatory, anniversaries in the hills, rooftop nights downtown. Your map is calculated for the precise night and spot you choose in the city, then printed or delivered in HD from the same design.",
    useCase: {
      heading: "Made for the night you drove up to the Observatory",
      paragraphs: [
        "Every Angeleno knows the move: the drive up to Griffith Observatory at dusk, the city lighting up below, the sky doing the same above. First dates, anniversaries and one very famous hilltop are what this page is for — the night you went up the hill, fixed as the sky that was over it.",
      ],
    },
    example: {
      heading: "One Los Angeles night, exactly as it was",
      place: "Griffith Observatory",
      dateLine: "November 16, 2024",
      paragraphs: [
        "On Saturday, November 16, 2024 — the night after the full Moon — the just-past-full Moon rose over the hills at 5:23 p.m. Venus was shining in the southwest at dusk, and Saturn stood almost due south, about halfway up the sky at 47°, where it stayed all evening. By 7 p.m. the Moon, 97.7% lit, was climbing in the east-northeast.",
        "A star map for that night is the sky a Griffith first date actually got.",
      ],
      caption: "Griffith Observatory, Los Angeles, CA · November 16, 2024",
    },
    guidance: {
      heading: "Los Angeles sky notes that change what you enter",
      points: [
        {
          lead: "Winter evenings go fully dark early here.",
          text: "On December 14, 2024 the Sun set at 4:45 p.m. and full darkness had fallen by 6:17 p.m. At LA's latitude, a holiday-season dinner moment at 7 p.m. is a true night-sky moment — if your date was a December one, don't assume you need a late hour for a 'real' night sky on your map.",
        },
        {
          lead: "Confirm the exact spot in a very big basin.",
          text: "The editor prefill starts from downtown's coordinates (34.0522°N, 118.2437°W). A moment in Malibu, Pasadena or up at the Observatory is a different spot on the map — confirm your exact location in the editor before you order.",
        },
      ],
      sources: [
        "Sky times and positions calculated for Los Angeles' coordinates with the same astronomy engine that renders every StarMapCo map; the worked example uses Griffith Observatory's own hilltop coordinates.",
      ],
    },
    coverage: {
      heading: "One page for the American West",
      paragraphs: [
        "This page now speaks for the western United States, including the Mountain West. Moments from San Francisco, San Diego, Seattle, Portland, Las Vegas and Denver start here — then enter your actual city in the editor.",
        "Your map is calculated for the exact place and date you enter. A Denver sky is not a Los Angeles sky, and your chart will show your place's sky, not this city's.",
      ],
    },
    faq: {
      question: "My moment was in Denver — is a Los Angeles page right for it?",
      answer:
        "This page covers the West, including the Mountain West. Enter Denver and your date in the editor and your map is calculated for Denver's exact sky.",
    },
  },

  "london-uk": {
    slug: "london-uk",
    title: "London Star Map — Your Night Over the Thames | StarMapCo",
    heading: "A star map for your London night",
    metaDescription:
      "Create a custom star map of a London moment — an anniversary walk on Primrose Hill, a first evening along the South Bank. Calculated for your exact date, time and place, with a free preview.",
    intro:
      "London moments are walking moments: the South Bank at dusk, the climb up Primrose Hill, a bridge crossed at midnight. Your map is calculated for the precise night and spot you choose in the city, then printed or delivered in HD from the same design.",
    useCase: {
      heading: "Made for the night you walked the river",
      paragraphs: [
        "London's anniversaries are measured in walks: along the South Bank as the lights come on, up Primrose Hill to watch the sky change over the skyline, across a bridge on the way home from a first date that ran long. This page is for those nights — the evening you walked the river, fixed as the sky that was actually over it.",
      ],
    },
    example: {
      heading: "One London night, exactly as it was",
      place: "Primrose Hill",
      dateLine: "August 19, 2024",
      paragraphs: [
        "On Monday, August 19, 2024, summer's full Sturgeon Moon — that year's seasonal 'blue moon' — rose over the skyline at 8:32 p.m., nineteen minutes after sunset. By 9:30 it was clear of the rooftops in the southeast, 99.9% lit.",
        "A star map for that evening is the sky a Primrose Hill anniversary walk actually ended under.",
      ],
      caption: "Primrose Hill, London, United Kingdom · August 19, 2024",
    },
    guidance: {
      heading: "London sky notes that change what you enter",
      points: [
        {
          lead: "Midsummer London never fully darkens.",
          text: "Around the June solstice, at London's latitude of 51.5°N, the Sun bottoms out only 14.5° below the horizon, so the night stays in deep twilight and never reaches true astronomical darkness. A June wedding's 'midnight sky' in London is honestly a twilight sky. Enter the time of the moment you actually shared — the 11 p.m. walk, not midnight by default — and your map will be true to it.",
        },
        {
          lead: "Confirm your actual spot.",
          text: "The editor prefill starts from central London's coordinates (51.5074°N, 0.1278°W). Greenwich, Richmond and Hampstead are all London, but confirm the spot where your moment happened in the editor before ordering — your map is calculated for the coordinates you confirm.",
        },
      ],
      sources: [
        "Sky times and positions calculated for London's coordinates with the same astronomy engine that renders every StarMapCo map.",
      ],
    },
    coverage: {
      heading: "One page for the United Kingdom",
      paragraphs: [
        "This page now speaks for the whole United Kingdom. Moments from Edinburgh, Cardiff, Manchester or anywhere else in the UK start here — then enter your actual town or city in the editor; your map is calculated for that exact place and date.",
        "This page covers the UK only. If your moment was in Paris, Tokyo, Singapore or Sydney, those places aren't claimed here — the star map maker will still calculate their skies just as exactly, starting from the poster page.",
      ],
    },
    faq: {
      question: "My moment was in Edinburgh — does a London page cover it?",
      answer:
        "Yes — this page covers the whole UK. Enter Edinburgh and your date in the editor; your map is calculated for Edinburgh's exact sky, not London's.",
    },
  },
};

export function getSurvivorContent(slug: string): SeoSurvivorContent | null {
  return SEO_SURVIVOR_CONTENT[slug] ?? null;
}
