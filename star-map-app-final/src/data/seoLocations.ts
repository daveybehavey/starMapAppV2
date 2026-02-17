export type SeoLocation = {
  slug: string;
  city: string;
  region?: string;
  country?: string;
};

export const seoLocations: SeoLocation[] = [
  { slug: "new-york-ny", city: "New York", region: "NY", country: "USA" },
  { slug: "los-angeles-ca", city: "Los Angeles", region: "CA", country: "USA" },
  { slug: "chicago-il", city: "Chicago", region: "IL", country: "USA" },
  { slug: "houston-tx", city: "Houston", region: "TX", country: "USA" },
  { slug: "phoenix-az", city: "Phoenix", region: "AZ", country: "USA" },
  { slug: "philadelphia-pa", city: "Philadelphia", region: "PA", country: "USA" },
  { slug: "san-antonio-tx", city: "San Antonio", region: "TX", country: "USA" },
  { slug: "san-diego-ca", city: "San Diego", region: "CA", country: "USA" },
  { slug: "dallas-tx", city: "Dallas", region: "TX", country: "USA" },
  { slug: "san-jose-ca", city: "San Jose", region: "CA", country: "USA" },
  { slug: "austin-tx", city: "Austin", region: "TX", country: "USA" },
  { slug: "jacksonville-fl", city: "Jacksonville", region: "FL", country: "USA" },
  { slug: "fort-worth-tx", city: "Fort Worth", region: "TX", country: "USA" },
  { slug: "columbus-oh", city: "Columbus", region: "OH", country: "USA" },
  { slug: "charlotte-nc", city: "Charlotte", region: "NC", country: "USA" },
  { slug: "san-francisco-ca", city: "San Francisco", region: "CA", country: "USA" },
  { slug: "indianapolis-in", city: "Indianapolis", region: "IN", country: "USA" },
  { slug: "seattle-wa", city: "Seattle", region: "WA", country: "USA" },
  { slug: "denver-co", city: "Denver", region: "CO", country: "USA" },
  { slug: "washington-dc", city: "Washington", region: "DC", country: "USA" },
  { slug: "boston-ma", city: "Boston", region: "MA", country: "USA" },
  { slug: "el-paso-tx", city: "El Paso", region: "TX", country: "USA" },
  { slug: "nashville-tn", city: "Nashville", region: "TN", country: "USA" },
  { slug: "detroit-mi", city: "Detroit", region: "MI", country: "USA" },
  { slug: "oklahoma-city-ok", city: "Oklahoma City", region: "OK", country: "USA" },
  { slug: "portland-or", city: "Portland", region: "OR", country: "USA" },
  { slug: "las-vegas-nv", city: "Las Vegas", region: "NV", country: "USA" },
  { slug: "memphis-tn", city: "Memphis", region: "TN", country: "USA" },
  { slug: "louisville-ky", city: "Louisville", region: "KY", country: "USA" },
  { slug: "baltimore-md", city: "Baltimore", region: "MD", country: "USA" },
  { slug: "milwaukee-wi", city: "Milwaukee", region: "WI", country: "USA" },
  { slug: "albuquerque-nm", city: "Albuquerque", region: "NM", country: "USA" },
  { slug: "tucson-az", city: "Tucson", region: "AZ", country: "USA" },
  { slug: "fresno-ca", city: "Fresno", region: "CA", country: "USA" },
  { slug: "sacramento-ca", city: "Sacramento", region: "CA", country: "USA" },
  { slug: "kansas-city-mo", city: "Kansas City", region: "MO", country: "USA" },
  { slug: "mesa-az", city: "Mesa", region: "AZ", country: "USA" },
  { slug: "atlanta-ga", city: "Atlanta", region: "GA", country: "USA" },
  { slug: "omaha-ne", city: "Omaha", region: "NE", country: "USA" },
  { slug: "colorado-springs-co", city: "Colorado Springs", region: "CO", country: "USA" },
  { slug: "raleigh-nc", city: "Raleigh", region: "NC", country: "USA" },
  { slug: "miami-fl", city: "Miami", region: "FL", country: "USA" },
  { slug: "long-beach-ca", city: "Long Beach", region: "CA", country: "USA" },
  { slug: "virginia-beach-va", city: "Virginia Beach", region: "VA", country: "USA" },
  { slug: "oakland-ca", city: "Oakland", region: "CA", country: "USA" },
  { slug: "minneapolis-mn", city: "Minneapolis", region: "MN", country: "USA" },
  { slug: "tulsa-ok", city: "Tulsa", region: "OK", country: "USA" },
  { slug: "tampa-fl", city: "Tampa", region: "FL", country: "USA" },
  { slug: "arlington-tx", city: "Arlington", region: "TX", country: "USA" },
  { slug: "new-orleans-la", city: "New Orleans", region: "LA", country: "USA" },
  { slug: "wichita-ks", city: "Wichita", region: "KS", country: "USA" },
  { slug: "cleveland-oh", city: "Cleveland", region: "OH", country: "USA" },
  { slug: "bakersfield-ca", city: "Bakersfield", region: "CA", country: "USA" },
  { slug: "aurora-co", city: "Aurora", region: "CO", country: "USA" },
  { slug: "anaheim-ca", city: "Anaheim", region: "CA", country: "USA" },
  { slug: "honolulu-hi", city: "Honolulu", region: "HI", country: "USA" },
  { slug: "orlando-fl", city: "Orlando", region: "FL", country: "USA" },
  { slug: "pittsburgh-pa", city: "Pittsburgh", region: "PA", country: "USA" },
  { slug: "cincinnati-oh", city: "Cincinnati", region: "OH", country: "USA" },
  { slug: "salt-lake-city-ut", city: "Salt Lake City", region: "UT", country: "USA" },
  { slug: "charleston-sc", city: "Charleston", region: "SC", country: "USA" },
  { slug: "boise-id", city: "Boise", region: "ID", country: "USA" },
  { slug: "madison-wi", city: "Madison", region: "WI", country: "USA" },
  { slug: "providence-ri", city: "Providence", region: "RI", country: "USA" },
  { slug: "toronto-on", city: "Toronto", region: "ON", country: "Canada" },
  { slug: "vancouver-bc", city: "Vancouver", region: "BC", country: "Canada" },
  { slug: "montreal-qc", city: "Montreal", region: "QC", country: "Canada" },
  { slug: "london-uk", city: "London", country: "United Kingdom" },
  { slug: "manchester-uk", city: "Manchester", country: "United Kingdom" },
  { slug: "paris-fr", city: "Paris", country: "France" },
  { slug: "berlin-de", city: "Berlin", country: "Germany" },
  { slug: "amsterdam-nl", city: "Amsterdam", country: "Netherlands" },
  { slug: "rome-it", city: "Rome", country: "Italy" },
  { slug: "madrid-es", city: "Madrid", country: "Spain" },
  { slug: "tokyo-jp", city: "Tokyo", country: "Japan" },
  { slug: "seoul-kr", city: "Seoul", country: "South Korea" },
  { slug: "singapore-sg", city: "Singapore", country: "Singapore" },
  { slug: "sydney-au", city: "Sydney", country: "Australia" },
  { slug: "melbourne-au", city: "Melbourne", country: "Australia" },
];

export function formatLocationDisplay(location: SeoLocation) {
  if (location.region) {
    return `${location.city}, ${location.region}`;
  }
  if (location.country) {
    return `${location.city}, ${location.country}`;
  }
  return location.city;
}
