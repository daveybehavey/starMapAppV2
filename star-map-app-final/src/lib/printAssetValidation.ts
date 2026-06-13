export type PrintAssetValidationConfig = {
  minBytes: number;
  minWidth: number;
  minHeight: number;
};

export type PrintAssetValidationResult =
  | { ok: true; width: number; height: number; byteLength: number }
  | { ok: false; code: string; message: string };

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPrintAssetValidationConfig(): PrintAssetValidationConfig {
  return {
    minBytes: parsePositiveInt(process.env.PRINT_ASSET_MIN_BYTES, 20_000),
    minWidth: parsePositiveInt(process.env.PRINT_ASSET_MIN_WIDTH, 800),
    minHeight: parsePositiveInt(process.env.PRINT_ASSET_MIN_HEIGHT, 800),
  };
}

/** Parse PNG/JPEG dimensions from raw bytes (no decode). */
export function parseImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width =
      ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
    const height =
      ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  if (bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segmentLength < 2 || offset + 2 + segmentLength > bytes.byteLength) break;
      const isSof =
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3 ||
        marker === 0xc5 ||
        marker === 0xc6 ||
        marker === 0xc7 ||
        marker === 0xc9 ||
        marker === 0xca ||
        marker === 0xcb ||
        marker === 0xcd ||
        marker === 0xce ||
        marker === 0xcf;
      if (isSof) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        if (width > 0 && height > 0) return { width, height };
        return null;
      }
      offset += 2 + segmentLength;
    }
  }

  return null;
}

export function validatePrintAssetBytes(
  bytes: Uint8Array,
  config: PrintAssetValidationConfig = getPrintAssetValidationConfig(),
): PrintAssetValidationResult {
  if (bytes.byteLength < config.minBytes) {
    return {
      ok: false,
      code: "print_asset_too_small",
      message: `Print file is too small (${bytes.byteLength} bytes). Minimum is ${config.minBytes} bytes.`,
    };
  }

  const dimensions = parseImageDimensions(bytes);
  if (!dimensions) {
    return {
      ok: false,
      code: "print_asset_dimensions_unknown",
      message: "Could not read print image dimensions. Upload a valid PNG or JPEG export.",
    };
  }

  if (dimensions.width < config.minWidth || dimensions.height < config.minHeight) {
    return {
      ok: false,
      code: "print_asset_resolution_too_low",
      message: `Print image is ${dimensions.width}×${dimensions.height}px. Minimum is ${config.minWidth}×${config.minHeight}px.`,
    };
  }

  return {
    ok: true,
    width: dimensions.width,
    height: dimensions.height,
    byteLength: bytes.byteLength,
  };
}
