/**
 * Security Settings Runtime
 *
 * LilPOS Security Settings — manages PIN code enabled, screen idle timer,
 * and screen timeout seconds. Persisted via the existing manager settings
 * localStorage pattern.
 */

export const SECURITY_SETTINGS_DEFAULTS = {
  pinCodeEnabled: true,
  screenIdleTimerEnabled: false,
  screenTimeoutSeconds: 300
};

export type SecuritySettings = {
  pinCodeEnabled: boolean;
  screenIdleTimerEnabled: boolean;
  screenTimeoutSeconds: number;
};

/**
 * Read security settings from the manager settings store.
 * Works with the existing localStorage-based settings pattern.
 * @param readManagerSettingsFn - the app's readManagerSettings function
 */
export function readSecuritySettings(
  readManagerSettingsFn: () => Record<string, any>
): SecuritySettings {
  try {
    const settings = readManagerSettingsFn();
    return {
      pinCodeEnabled:
        settings['security.pinCodeEnabled'] !== undefined
          ? !!settings['security.pinCodeEnabled']
          : SECURITY_SETTINGS_DEFAULTS.pinCodeEnabled,
      screenIdleTimerEnabled:
        settings['security.screenIdleTimerEnabled'] !== undefined
          ? !!settings['security.screenIdleTimerEnabled']
          : SECURITY_SETTINGS_DEFAULTS.screenIdleTimerEnabled,
      screenTimeoutSeconds:
        settings['security.screenTimeoutSeconds'] !== undefined
          ? clampTimeout(Number(settings['security.screenTimeoutSeconds']))
          : SECURITY_SETTINGS_DEFAULTS.screenTimeoutSeconds
    };
  } catch (err) {
    console.error('Failed to read security settings:', err);
    return { ...SECURITY_SETTINGS_DEFAULTS };
  }
}

/**
 * Write security settings into a manager settings object for persistence.
 * Returns the merged settings object (does not persist itself).
 * @param existingSettings - the existing manager settings object from readManagerSettings()
 * @param security - the security settings to write
 */
export function writeSecuritySettings(
  existingSettings: Record<string, any>,
  security: Partial<SecuritySettings>
): Record<string, any> {
  const next = { ...existingSettings };
  if (security.pinCodeEnabled !== undefined) {
    next['security.pinCodeEnabled'] = !!security.pinCodeEnabled;
  }
  if (security.screenIdleTimerEnabled !== undefined) {
    next['security.screenIdleTimerEnabled'] = !!security.screenIdleTimerEnabled;
  }
  if (security.screenTimeoutSeconds !== undefined) {
    next['security.screenTimeoutSeconds'] = clampTimeout(Number(security.screenTimeoutSeconds));
  }
  return next;
}

/**
 * Clamp seconds to valid range [10, 3600].
 */
export function clampTimeout(seconds: number): number {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return SECURITY_SETTINGS_DEFAULTS.screenTimeoutSeconds;
  return Math.max(10, Math.min(3600, Math.round(n)));
}