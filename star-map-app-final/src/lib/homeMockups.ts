/** Homepage lifestyle mockups — sourced from ideas/mockups, served from /home-mockups/.
 *  unframedPoster is the exception: it points at the square print-proof mockup under
 *  /printproof/ because the product is an 18x18 square poster and the old
 *  /home-mockups/offer-unframed-print.png depicted a portrait poster. */
export const HOME_MOCKUPS = {
  digitalHd: "/home-mockups/offer-digital-hd.png",
  framedBedroom: "/home-mockups/offer-framed-print.png",
  unframedPoster: "/printproof/unframed-mockup.jpg",
  livingRoomFramed: "/home-mockups/gallery-living-room-framed.png",
  starPoster: "/home-mockups/gallery-star-poster.png",
  familyBedroom: "/home-mockups/gallery-family-bedroom.png",
  framedLightWood: "/home-mockups/gallery-framed-light-wood.png",
  tabletRender: "/home-mockups/gallery-tablet-render.png",
} as const;
