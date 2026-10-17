/**
 * Sync sample/demo design text boxes when the user picks a new date or location.
 * Overwrites while the box is untouched and its text still equals either the
 * wedding sample constant or the last value this sync wrote. Manual edits
 * (touched) permanently stop syncing for that box.
 */

export const SAMPLE_DESIGN_TITLE = "The Night We Became One";
export const SAMPLE_DESIGN_PLACE = "Santorini, Greece";
export const SAMPLE_DESIGN_DATE = "June 1, 2024";

export type SampleDesignTextBox = {
  id: string;
  text: string;
};

export type SampleDesignTouchedState = {
  subtitle?: boolean;
  dedication?: boolean;
};

/** Last values written by auto-sync (not by the user). */
export type SampleDesignLastAutoSynced = {
  subtitle?: string | null;
  dedication?: string | null;
};

export type SyncSampleDesignTextBoxesResult<T extends SampleDesignTextBox> = {
  textBoxes: T[];
  lastAutoSynced: SampleDesignLastAutoSynced;
  changed: boolean;
};

/** Format a YYYY-MM-DD (or Date) as "June 1, 2024" to match the wedding sample. */
export function formatSampleDedicationDate(dateInput: string | Date): string {
  let year: number;
  let month: number;
  let day: number;

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else {
      const parsed = new Date(trimmed);
      if (!Number.isFinite(parsed.getTime())) return "";
      year = parsed.getUTCFullYear();
      month = parsed.getUTCMonth() + 1;
      day = parsed.getUTCDate();
    }
  } else {
    if (!Number.isFinite(dateInput.getTime())) return "";
    year = dateInput.getFullYear();
    month = dateInput.getMonth() + 1;
    day = dateInput.getDate();
  }

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";
  const local = new Date(year, month - 1, day, 12, 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(local);
}

function isEligibleForAutoSync(
  currentText: string,
  touched: boolean | undefined,
  sampleConstant: string,
  lastAuto: string | null | undefined
): boolean {
  if (touched) return false;
  if (currentText === sampleConstant) return true;
  return typeof lastAuto === "string" && lastAuto.length > 0 && currentText === lastAuto;
}

/**
 * When subtitle is untouched and still holds the sample place (or the last
 * auto-synced place), replace it with the picked location display name.
 * When dedication is untouched and still holds the sample date (or the last
 * auto-synced date), replace it with the formatted picked date.
 */
export function syncSampleDesignTextBoxes<T extends SampleDesignTextBox>(input: {
  textBoxes: readonly T[];
  touched: SampleDesignTouchedState;
  lastAutoSynced?: SampleDesignLastAutoSynced | null;
  locationDisplayName?: string | null;
  dateValue?: string | Date | null;
}): SyncSampleDesignTextBoxesResult<T> {
  const placeName =
    typeof input.locationDisplayName === "string" ? input.locationDisplayName.trim() : "";
  const formattedDate = input.dateValue ? formatSampleDedicationDate(input.dateValue) : "";
  const prevLast: SampleDesignLastAutoSynced = {
    subtitle: input.lastAutoSynced?.subtitle ?? null,
    dedication: input.lastAutoSynced?.dedication ?? null,
  };

  let changed = false;
  let nextLast = prevLast;
  const next = input.textBoxes.map((box) => {
    if (
      box.id === "subtitle" &&
      placeName &&
      placeName !== box.text &&
      isEligibleForAutoSync(box.text, input.touched.subtitle, SAMPLE_DESIGN_PLACE, prevLast.subtitle)
    ) {
      changed = true;
      nextLast = { ...nextLast, subtitle: placeName };
      return { ...box, text: placeName };
    }
    if (
      box.id === "dedication" &&
      formattedDate &&
      formattedDate !== box.text &&
      isEligibleForAutoSync(box.text, input.touched.dedication, SAMPLE_DESIGN_DATE, prevLast.dedication)
    ) {
      changed = true;
      nextLast = { ...nextLast, dedication: formattedDate };
      return { ...box, text: formattedDate };
    }
    return box;
  });

  if (!changed) {
    return {
      textBoxes: input.textBoxes as T[],
      lastAutoSynced: prevLast,
      changed: false,
    };
  }

  return {
    textBoxes: next,
    lastAutoSynced: nextLast,
    changed: true,
  };
}
