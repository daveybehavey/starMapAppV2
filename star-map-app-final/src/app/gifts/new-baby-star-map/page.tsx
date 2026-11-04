import OccasionGiftPage, { giftMetadata, occasionGifts } from "../OccasionGiftPage";

export const dynamic = "force-dynamic";
export const metadata = giftMetadata(occasionGifts.baby);

export default function Page() {
  return <OccasionGiftPage gift={occasionGifts.baby} />;
}
