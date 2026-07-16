import { ManifestPlacement } from '../domain/entities/types';

/**
 * Normalize a placement preference: trims and uppercases the country
 * (ISO 3166-1 alpha-2) and region codes. Returns undefined when nothing is set.
 */
export function normalizePlacement(pref?: ManifestPlacement): ManifestPlacement | undefined {
  const country = pref?.country?.trim().toUpperCase();
  const region = pref?.region?.trim().toUpperCase();
  if (!country && !region) return undefined;
  return { ...(country && { country }), ...(region && { region }) };
}

/**
 * Map a placement preference to the soft-preference fields of the backend's
 * DeployApplicationInput (preferredCountry/preferredRegion). Empty object when
 * no preference is set.
 */
export function toDeployPlacementInput(pref?: ManifestPlacement): {
  preferredCountry?: string;
  preferredRegion?: string;
} {
  const normalized = normalizePlacement(pref);
  if (!normalized) return {};
  return {
    ...(normalized.country && { preferredCountry: normalized.country }),
    ...(normalized.region && { preferredRegion: normalized.region }),
  };
}
