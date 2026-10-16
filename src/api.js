// import { CapacitorHttp } from '@capacitor/core';

const API_BASE_URL = 'http://192.168.0.6:8000/api/app';

// Login using the backend API.
export async function loginUser(username, password) {
    const formData = new FormData();

    formData.append('username', username);
    formData.append('password', password);

    // Use fetch to send the login request to the backend API.
    const response = await fetch(`${API_BASE_URL}/login/`, {
        method: 'POST',
        body: formData,
    });

    const result = await response.json();

    // Check for HTTP errors and API response status.
    if (!response.ok) {
        throw new Error(
            result?.message || 'Invalid username or password.'
        );
    }

    // Check for API response status.
    if (result?.status !== 'success') {
        throw new Error(
            result?.message || 'Login failed. Please try again.'
        );
    }

    const data = result.data ?? result;

    const user = data.user ?? result.user;
    const categories = data.categories ?? result.categories;

    // Validate the presence of authentication tokens and user/category data.
    if (!data.access || !data.refresh) {
        throw new Error(
            'Login response does not contain authentication tokens.'
        );
    }

    if (!user || !Array.isArray(categories)) {
        throw new Error(
            'Login response is missing user or category data.'
        );
    }

    return {
        access: data.access,
        refresh: data.refresh,
        accessExpiresIn: data.access_expires_in,
        user,
        categories,
    };
}

// Load categories separately when needed.
/*export async function getCategories(accessToken) {
    const response = await CapacitorHttp.get({
        url: `${API_BASE_URL}/categories/`,
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error('Unable to load categories.');
    }

    const result = response.data;

    if (result?.status !== 'success') {
        throw new Error(
            result?.message || 'Unable to load categories.'
        );
    }

    const data = result.data ?? result;
    const categories = data.categories ?? data;

    if (!Array.isArray(categories)) {
        throw new Error('Invalid categories API response.');
    }

    return categories;
}*/
