import { Preferences } from '@capacitor/preferences';

const AUTH_KEY = 'ohm_store_auth';

// Save login information.
export async function saveAuth(authData) {
    await Preferences.set({
        key: AUTH_KEY,
        value: JSON.stringify(authData),
    });
}

// Get saved login information.
export async function getAuth() {
    const { value } = await Preferences.get({
        key: AUTH_KEY,
    });

    return value ? JSON.parse(value) : null;
}

// Clear login information during logout.
export async function clearAuth() {
    await Preferences.remove({
        key: AUTH_KEY,
    });
}
