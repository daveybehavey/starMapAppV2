/**
 * Sync sample/demo design text boxes when the user picks a new date or location.
 * Only overwrites while the box still holds the wedding sample string and the
 * user has not manually edited that box.
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

/**
 * When subtitle still equals the sample place text and is untouched, replace it
 * with the picked location display name. When dedication still equals the sample
 * date text and is untouched, replace it with the formatted picked date.
 */
export function syncSampleDesignTextBoxes<T extends SampleDesignTextBox>(input: {
  textBoxes: readonly T[];
  touched: SampleDesignTouchedState;
  locationDisplayName?: string | null;
  dateValue?: string | Date | null;
}): T[] {
  const placeName =
    typeof input.locationDisplayName === "string" ? input.locationDisplayName.trim() : "";
  const formattedDate = input.dateValue ? formatSampleDedicationDate(input.dateValue) : "";

  let changed = false;
  const next = input.textBoxes.map((box) => {
    if (
      box.id === "subtitle" &&
      !input.touched.subtitle &&
      box.text === SAMPLE_DESIGN_PLACE &&
      placeName &&
      placeName !== box.text
    ) {
      changed = true;
      return { ...box, text: placeName };
    }
    if (
      box.id === "dedication" &&
      !input.touched.dedication &&
      box.text === SAMPLE_DESIGN_DATE &&
      formattedDate &&
      formattedDate !== box.text
    ) {
      changed = true;
      return { ...box, text: formattedDate };
    }
    return box;
  });

  return changed ? next : (input.textBoxes as T[]);
}
