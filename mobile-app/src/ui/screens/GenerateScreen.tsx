import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { createMapRecipe, getMapViewerUrl, type CreateMapRecipeInput } from "@/lib/api/maps";

type GenerateScreenProps = {
  mobileToken: string | null;
  /** When true, send Authorization so the backend can debit Stripe-session credits / verify subscription. */
  attachMobileMapAuth: boolean;
  hasPremiumAccess: boolean;
  onOpenPaywall: () => void;
};

const STYLES: CreateMapRecipeInput["selectedStyle"][] = [
  "navyGold",
  "vintageEngraving",
  "parchmentScroll",
  "midnightMinimal",
];

export function GenerateScreen({
  mobileToken,
  attachMobileMapAuth,
  hasPremiumAccess,
  onOpenPaywall,
}: GenerateScreenProps) {
  const [title, setTitle] = useState("Our Star Map");
  const [subtitle, setSubtitle] = useState("Tap Generate to save a recipe to your backend.");
  const [locationName, setLocationName] = useState("Sample location");
  const [latitude, setLatitude] = useState("48.4284");
  const [longitude, setLongitude] = useState("-123.3656");
  const [timezone, setTimezone] = useState("America/Vancouver");
  const [selectedStyle, setSelectedStyle] = useState<CreateMapRecipeInput["selectedStyle"]>("navyGold");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(null);

  async function onGenerate() {
    setError(null);
    setMapId(null);
    setBusy(true);
    try {
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setError("Latitude and longitude must be valid numbers.");
        return;
      }

      const body: CreateMapRecipeInput = {
        version: 1,
        seed: `mobile-${Date.now()}`,
        datetimeISO: new Date().toISOString(),
        location: {
          name: locationName.trim() || "Custom location",
          latitude: lat,
          longitude: lon,
          timezone: timezone.trim() || "UTC",
        },
        textBoxes: [
          {
            id: "title",
            label: "Title",
            text: title.trim() || " ",
            fontFamily: "playfair",
            align: "center",
            size: 30,
          },
          {
            id: "subtitle",
            label: "",
            text: subtitle.trim() || " ",
            fontFamily: "montserrat",
            align: "center",
            size: 14,
          },
        ],
        selectedStyle,
        aspectRatio: "square",
        shape: "rectangle",
      };

      const { id } = await createMapRecipe(body, attachMobileMapAuth ? mobileToken : undefined);
      setMapId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create map.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Create Star Map</Text>
      <Text style={styles.body}>
        This calls your live <Text style={styles.mono}>POST /api/maps</Text> route. When you are signed in with a
        mobile token, the backend attaches your account entitlements and debits credits when applicable.
      </Text>

      {!hasPremiumAccess ? (
        <>
          <Text style={styles.warn}>Upgrade to unlock full generation from the app shell.</Text>
          <Pressable style={styles.button} onPress={onOpenPaywall}>
            <Text style={styles.buttonText}>View plans</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.ok}>Premium path enabled — you can generate.</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            placeholderTextColor="#6f86b2"
          />

          <Text style={styles.label}>Subtitle</Text>
          <TextInput
            value={subtitle}
            onChangeText={setSubtitle}
            style={styles.input}
            placeholderTextColor="#6f86b2"
          />

          <Text style={styles.label}>Location name</Text>
          <TextInput
            value={locationName}
            onChangeText={setLocationName}
            style={styles.input}
            placeholderTextColor="#6f86b2"
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Latitude</Text>
              <TextInput
                value={latitude}
                onChangeText={setLatitude}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholderTextColor="#6f86b2"
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Longitude</Text>
              <TextInput
                value={longitude}
                onChangeText={setLongitude}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholderTextColor="#6f86b2"
              />
            </View>
          </View>

          <Text style={styles.label}>IANA timezone</Text>
          <TextInput
            value={timezone}
            onChangeText={setTimezone}
            autoCapitalize="none"
            style={styles.input}
            placeholderTextColor="#6f86b2"
          />

          <Text style={styles.label}>Style</Text>
          <View style={styles.styleRow}>
            {STYLES.map((s) => (
              <Pressable
                key={s}
                onPress={() => setSelectedStyle(s)}
                style={[styles.chip, selectedStyle === s && styles.chipActive]}
              >
                <Text style={[styles.chipText, selectedStyle === s && styles.chipTextActive]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.button} onPress={() => void onGenerate()} disabled={busy}>
            {busy ? <ActivityIndicator color="#f3f7ff" /> : <Text style={styles.buttonText}>Generate map</Text>}
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {mapId ? (
            <View style={styles.result}>
              <Text style={styles.ok}>Saved map id</Text>
              <Text style={styles.monoSmall}>{mapId}</Text>
              <Pressable
                style={styles.buttonSecondary}
                onPress={() => {
                  void Linking.openURL(getMapViewerUrl(mapId));
                }}
              >
                <Text style={styles.buttonText}>Open in browser</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#11192a",
    borderColor: "#273554",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  title: {
    color: "#f3f7ff",
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    color: "#b8c7e4",
    lineHeight: 21,
  },
  mono: {
    fontFamily: "monospace",
    color: "#dbe7ff",
  },
  monoSmall: {
    fontFamily: "monospace",
    color: "#dbe7ff",
    fontSize: 12,
  },
  ok: {
    color: "#7ef5b0",
    fontWeight: "600",
  },
  warn: {
    color: "#ffd37a",
    fontWeight: "600",
  },
  error: {
    color: "#ff9fa3",
    lineHeight: 20,
  },
  label: {
    color: "#94a8cd",
    fontSize: 13,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#273554",
    backgroundColor: "#0b1222",
    borderRadius: 10,
    color: "#f3f7ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  rowItem: {
    flex: 1,
  },
  styleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#32466f",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#1b2640",
  },
  chipActive: {
    borderColor: "#4f7bce",
    backgroundColor: "#365ea8",
  },
  chipText: {
    color: "#b9c9e8",
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#f3f7ff",
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#2a4a8e",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 140,
    alignItems: "center",
  },
  buttonSecondary: {
    alignSelf: "flex-start",
    backgroundColor: "#32415f",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  buttonText: {
    color: "#f3f7ff",
    fontWeight: "600",
  },
  result: {
    marginTop: 6,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#273554",
    paddingTop: 12,
  },
});
