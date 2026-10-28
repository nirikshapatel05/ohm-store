/**
 * API module for handling authentication and data retrieval.
 * @module api
 */

/**
 * Base URL for the backend API.
 * @constant {string}
 */
const API_BASE_URL = 'http://192.168.0.6:8000/api/app';

/**
 * Login using the backend API.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<AuthData>}
 */
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

/**
 * Load categories separately when needed.
 * @param {string} accessToken
 * @returns {Promise<Category[]>}
 */
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

/**
 * Get products using API.
 * @param {string} accessToken
 * @param {number} userId
 * @param {number} storeId
 * @param {number} categoryId
 * @param {number} subcategoryId
 * @returns {Promise<Product[]>}
 */
export async function getProducts(
    accessToken,
    userId,
    storeId,
    categoryId,
    subcategoryId
) {
    const params = new URLSearchParams({
        user_id: String(userId),
        store_id: String(storeId),
        category_id: String(categoryId),
        subcategory_id: String(subcategoryId),
    });

    // Use fetch to send the request to the backend API.
    const response = await fetch(
        `${API_BASE_URL}/products/?${params.toString()}`,
        {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    const result = await response.json();

    // Check for HTTP errors and API response status.
    if (!response.ok) {
        throw new Error(
            result?.message || `Products API failed: ${response.status}`
        );
    }

    // Check for API response status.
    if (result?.status !== 'success') {
        throw new Error(
            result?.message || 'Unable to load products.'
        );
    }

    const products = result.data?.products;

    if (!Array.isArray(products)) {
        throw new Error('Invalid products API response.');
    }

    return products;
}

/**
 * Submit the scan summary to the backend API.
 * @param {string} accessToken - The access token for authentication.
 * @param {number} userId - The ID of the user submitting the summary.
 * @param {number} storeId - The ID of the store.
 * @param {number} categoryId - The ID of the category.
 * @param {number} subcategoryId - The ID of the subcategory.
 * @param {number} totalScan - The total number of products scanned.
 * @param {number} totalMatched - The number of matched products.
 * @param {number} totalMisMatched - The number of mismatched products.
 * @param {Array} products - An array of product objects to be submitted.
 * @returns {Promise<Object>} - The response data from the API.
 */
export async function submitSummary(
    accessToken,
    userId,
    storeId,
    categoryId,
    subcategoryId,
    totalScan,
    totalMatched,
    totalMisMatched,
    products
) {
    // Create a FormData object to hold the summary data.
    const formData = new FormData();

    // Include each available product ID and its scanned quantity.
    const productData = products.map((product) => ({
        product_id: product.product_id,
        quantity: product.quantity,
    }));

    formData.append('user_id', userId);
    formData.append('store_id', storeId);
    formData.append('category_id', categoryId);
    formData.append('subcategory_id', subcategoryId);
    formData.append('total_scan', totalScan);
    formData.append('total_unique_scan', products.length);
    formData.append('total_matched', totalMatched);
    formData.append('not_found_scan', totalMisMatched);
    formData.append('products', JSON.stringify(productData));

    // Use fetch to send the summary submission request to the backend API.
    const response = await fetch(`${API_BASE_URL}/scan_history/`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
    });

    // Get the JSON response from the API.
    const result = await response.json();

    // Check for HTTP errors and API response status.
    if (!response.ok) {
        throw new Error(
            result?.message || `Summary API failed: ${response.status}`
        );
    }

    // Check for API response status.
    if (result?.status !== 'success') {
        throw new Error(
            result?.message || 'Unable to submit scan summary.'
        );
    }

    return result.data ?? result;
}


