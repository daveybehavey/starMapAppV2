import OccasionGiftPage, { giftMetadata, occasionGifts } from "../OccasionGiftPage";

export const dynamic = "force-dynamic";
export const metadata = giftMetadata(occasionGifts.anniversary);

export default function Page() {
  return <OccasionGiftPage gift={occasionGifts.anniversary} />;
}
