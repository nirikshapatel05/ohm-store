/**
 * Authentication module for handling login information storage and retrieval.
 * @module auth
 */

import { Preferences } from '@capacitor/preferences';

/**
 * Key used for storing authentication data in preferences.
 * @constant {string}
 */
const AUTH_KEY = 'ohm_store_auth';

/**
 * Save login information.
 * @param {AuthData} authData
 * @returns {Promise<void>}
 */
export async function saveAuth(authData) {
    await Preferences.set({
        key: AUTH_KEY,
        value: JSON.stringify(authData),
    });
}

/**
 * Get saved login information.
 * @returns {Promise<AuthData | null>}
 */
export async function getAuth() {
    const { value } = await Preferences.get({
        key: AUTH_KEY,
    });

    return value ? JSON.parse(value) : null;
}

/**
 * Clear login information during logout.
 * @returns {Promise<void>}
 */
export async function clearAuth() {
    await Preferences.remove({
        key: AUTH_KEY,
    });
}
