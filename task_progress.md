# Task Progress

## Issue 1: Fix keyboard/pinpad page-drag behavior
- [ ] Analyze root cause of background movement
- [ ] Add touch-action CSS to keyboard/pinpad surfaces
- [ ] Add pointerdown/touchstart event prevention on PIN pad buttons
- [ ] Verify existing keyboard event handlers already prevent propagation

## Issue 2: Add Security settings area
- [ ] Create security-settings-runtime.ts module
- [ ] Create security-idle-lock.ts module  
- [ ] Extend persistManagerSettings/readManagerSettings in app.ts
- [ ] Add Security tile in MANAGER_SETTINGS_TILES
- [ ] Add renderManagerSecuritySettingsView() function
- [ ] Add security section in renderManagerSettingsView()
- [ ] Add event bindings for security settings
- [ ] Add CSS styles for security settings
- [ ] Wire up idle timer initialization

## Validation
- [ ] Run npm run typecheck
- [ ] Run npm run build
- [ ] Run npm run test