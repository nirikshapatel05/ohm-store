/**
 * Store Management – main application module.
 *
 * Flow:
 *   1. Login            → authenticates against the API and stores the session.
 *   2. Selection        → user picks a category and sub-category.
 *   3. Scanning         → products for that selection are loaded, then each
 *                         scanned barcode is checked against them.
 *   4. Summary          → totals of scanned / available / not-available items.
 *
 * Dependencies:
 *   - ./api.js  → loginUser(), getProducts()
 *   - ./auth.js → saveAuth(), getAuth(), clearAuth() (persistent session)
 *   - @capacitor/barcode-scanner → native camera barcode scanning
 */

import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import { loginUser, getProducts, submitSummary } from './api.js';
import { saveAuth, getAuth, clearAuth } from './auth.js';

/* -------------------------------------------------------------------------- */
/*  Types (documentation only)                                                */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {Object} Subcategory
 * @property {number|string} id
 * @property {string} name
 */

/**
 * @typedef {Object} Category
 * @property {number|string} id
 * @property {string} name
 * @property {Subcategory[]} [subcategories]
 */

/**
 * @typedef {Object} User
 * @property {number|string} id
 * @property {string} [name]
 * @property {number|string} store_id
 * @property {string} [store_name]
 */

/**
 * @typedef {Object} Product
 * @property {number|string} product_id       Barcode value.
 * @property {string} product_name
 * @property {string} category_name
 * @property {string} subcategory_name
 * @property {number} mrp
 * @property {number} quantity
 */

/**
 * @typedef {Object} AuthData  Payload returned by the login API.
 * @property {string} access
 * @property {string} refresh
 * @property {User} user
 * @property {Category[]} categories
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const MESSAGES = {
    loginRequired: 'Please enter your username and password.',
    loginFailed: 'Unable to log in. Please try again.',
    sessionExpired: 'Please log in again.',
    productsFailed: 'Unable to load products.',
    logoutFailed: 'Unable to log out. Please try again.',
    scanFailed: 'Unable to scan the barcode.',
    noBarcode: 'No barcode detected.',
    noProducts: 'No products found for the selected category and sub-category.',
};

const LABELS = {
    next: 'Next',
    startScanning: 'Start Scanning',
    loadingProducts: 'Loading products...',
    scanHeading: 'Scan Products',
    summaryHeading: 'Summary',
};

const PLACEHOLDERS = {
    category: '<option value="">Select Category</option>',
    subCategory: '<option value="">Select Sub-category</option>',
};

/* -------------------------------------------------------------------------- */
/*  Application state                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Single source of truth for runtime data.
 * (Session data is also persisted via auth.js so it survives app restarts.)
 */
const state = {
    /** @type {string|null} */ accessToken: null,
    /** @type {string|null} */ refreshToken: null,
    /** @type {User|null} */ currentUser: null,
    /** @type {Category[]} */ categories: [],
    /** @type {Product[]} Products for the selected category/sub-category. */
    products: [],
    /** Counters for the current scanning session. */
    stats: { total: 0, matched: 0, mismatched: 0 },
    availableProducts: [],
};

/* -------------------------------------------------------------------------- */
/*  DOM references                                                            */
/* -------------------------------------------------------------------------- */

const $ = (selector) => document.querySelector(selector);

const dom = {
    // Login screen
    loginScreen: $('#login-screen'),
    usernameInput: $('#username'),
    passwordInput: $('#password'),
    loginError: $('#login-error'),
    loginButton: $('#login-button'),

    // Selection screen
    selectionScreen: $('#selection-screen'),
    loggedInUsername: $('#logged-in-username'),
    logoutButton: $('#logout-button'),
    categorySelect: $('#category'),
    subCategorySelect: $('#sub-category'),
    startScanButton: $('#start-scan-button'),

    // Scanning screen
    scanningScreen: $('#scanning-screen'),
    scanHeading: $('#scanning-screen .screen-header h2'),
    backButton: $('#back-button'),
    selectedCategory: $('#selected-category'),
    selectedSubCategory: $('#selected-subcategory'),
    inventoryUploadedAt: $('#inventory-uploaded-at'),
    totalScannedCount: $('#total-scanned-count'),
    scanButton: $('#scan-barcode'),
    barcodeResult: $('#barcode-result'),
    productDetails: $('#product-details'),
    nextButton: $('#next-button'),
    finishButton: $('#finish-button'),
    summary: $('#summary'),
};

/**
 * Logs any element that could not be found, so a mismatch between
 * index.html and this file is easy to diagnose.
 */
function reportMissingElements() {
    const missing = Object.entries(dom)
        .filter(([, element]) => !element)
        .map(([name]) => name);

    if (missing.length > 0) {
        console.error(
            `Missing HTML elements (check index.html): ${missing.join(', ')}`
        );
    }
}

/* -------------------------------------------------------------------------- */
/*  Lookup helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Finds a category by ID.
 * @param {number|string} categoryId
 * @returns {Category|undefined}
 */
function findCategory(categoryId) {
    return state.categories.find(
        (category) => String(category.id) === String(categoryId)
    );
}

/**
 * Finds a sub-category by ID within a given category.
 * @param {Category|undefined} category
 * @param {number|string} subcategoryId
 * @returns {Subcategory|undefined}
 */
function findSubcategory(category, subcategoryId) {
    return category?.subcategories?.find(
        (subcategory) => String(subcategory.id) === String(subcategoryId)
    );
}

/**
 * Builds the "Name - Store" label shown in the header.
 * @param {User} user
 * @returns {string}
 */
function formatUserLabel(user) {
    return [user.name, user.store_name].filter(Boolean).join(' - ');
}

/* -------------------------------------------------------------------------- */
/*  Screen & form helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Shows one screen and hides the others.
 * @param {HTMLElement} screenToShow
 */
function showScreen(screenToShow) {
    [dom.loginScreen, dom.selectionScreen, dom.scanningScreen].forEach(
        (screen) => screen.classList.toggle('hidden', screen !== screenToShow)
    );
}

/**
 * Shows an error under the login form.
 * @param {string} message
 */
function showLoginError(message) {
    dom.loginError.textContent = message;
    dom.loginError.classList.remove('hidden');
}

/**
 * Clears the login error message.
 */
function clearLoginError() {
    dom.loginError.textContent = '';
    dom.loginError.classList.add('hidden');
}

/**
 * Fills the category dropdown from `state.categories`.
 * @returns {void}
 */
function populateCategories() {
    dom.categorySelect.innerHTML = PLACEHOLDERS.category;

    state.categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = String(category.id);
        option.textContent = category.name;
        dom.categorySelect.appendChild(option);
    });
}

/**
 * Fills the sub-category dropdown for the given category.
 * The dropdown stays disabled if the category has no sub-categories.
 * @param {Category|undefined} category
 * @returns {void}
 */
function populateSubcategories(category) {
    dom.subCategorySelect.innerHTML = PLACEHOLDERS.subCategory;
    dom.subCategorySelect.disabled = true;
    dom.startScanButton.disabled = true;

    const subcategories = category?.subcategories ?? [];

    subcategories.forEach((subcategory) => {
        const option = document.createElement('option');
        option.value = String(subcategory.id);
        option.textContent = subcategory.name;
        dom.subCategorySelect.appendChild(option);
    });

    dom.subCategorySelect.disabled = subcategories.length === 0;
}

/**
 * Resets both dropdowns to their initial state.
 * @returns {void}
 */
function resetSelection() {
    dom.categorySelect.value = '';
    populateSubcategories(undefined);
}

/**
 * Enables / disables the three scan action buttons.
 * @param {{scan: boolean, next: boolean, finish: boolean}} enabled
 */
function setScanControls({ scan, next, finish }) {
    dom.scanButton.disabled = !scan;
    dom.nextButton.disabled = !next;
    dom.finishButton.disabled = !finish;
}

/**
 * Resets counters and the scanning screen UI.
 * @returns {void}
 */
function resetScan() {
    state.stats = { total: 0, matched: 0, mismatched: 0 };

    state.availableProducts = [];

    dom.scanHeading.textContent = LABELS.scanHeading;
    dom.totalScannedCount.textContent = '0';
    dom.barcodeResult.innerHTML = '';
    dom.productDetails.innerHTML = '';
    dom.summary.innerHTML = '';

    dom.scanButton.classList.remove('hidden');
    dom.nextButton.classList.remove('hidden');
    dom.finishButton.classList.remove('hidden');

    setScanControls({ scan: true, next: false, finish: false });
}

/* -------------------------------------------------------------------------- */
/*  Session helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Loads an authenticated session into memory and prepares the
 * selection screen UI (does not switch screens).
 * @param {AuthData} data
 */
function applySession(data) {
    state.accessToken = data.access;
    state.refreshToken = data.refresh;
    state.currentUser = data.user;
    state.categories = data.categories ?? [];

    populateCategories();
    dom.loggedInUsername.textContent = formatUserLabel(state.currentUser);

    resetSelection();
    resetScan();
}

/**
 * Clears all in-memory session data and related UI.
 * @returns {void}
 */
function clearSession() {
    state.accessToken = null;
    state.refreshToken = null;
    state.currentUser = null;
    state.categories = [];
    state.products = [];

    resetScan();
    resetSelection();
    populateCategories();

    dom.loggedInUsername.textContent = '';
    dom.usernameInput.value = '';
    dom.passwordInput.value = '';
    clearLoginError();
}

/* -------------------------------------------------------------------------- */
/*  Rendering helpers                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Creates `<p><strong>label</strong> value</p>`.
 * `value` is inserted as text, so API data can never inject HTML.
 * @param {string} label
 * @param {string} value
 * @returns {HTMLParagraphElement}
 */
function createDetailRow(label, value) {
    const paragraph = document.createElement('p');
    const strong = document.createElement('strong');

    strong.textContent = `${label} `;
    paragraph.append(strong, document.createTextNode(value));

    return paragraph;
}

/**
 * Shows the scanned barcode value.
 * @param {string} barcode
 * @returns {void}
 */
function renderBarcode(barcode) {
    dom.barcodeResult.replaceChildren(createDetailRow('Barcode:', barcode));
}

/**
 * Shows an error / info message in the barcode result area.
 * @param {string} label
 * @param {string} message
 * @returns {void}
 */
function renderScanMessage(label, message) {
    dom.barcodeResult.replaceChildren(createDetailRow(label, message));
}

/**
 * Card shown when the barcode is not in the loaded product list.
 * @returns {void}
 */
function renderProductNotFound() {
    const card = document.createElement('div');
    card.className = 'product-card mismatch-highlight';

    const note = document.createElement('p');
    note.textContent = 'Product Not Found';

    const heading = document.createElement('h2');
    heading.textContent = 'Product Mismatch';

    card.append(note, heading);
    dom.productDetails.appendChild(card);
}

/**
 * Card showing product details.
 * @param {Product} product
 * @param {{actualCategory?: Category, actualSubcategory?: Subcategory, isMatch: boolean}} match
 * @returns {void}
 */
function renderProductCard(product, { actualCategory, actualSubcategory, isMatch }) {
    const card = document.createElement('div');
    card.className = isMatch
        ? 'product-card'
        : 'product-card mismatch-highlight';

    const heading = document.createElement('h2');
    heading.textContent = !isMatch ? 'Product Mismatch' : '';
    card.appendChild(heading);

    if (!isMatch) {
        card.appendChild(document.createElement('hr'));
    }

    card.append(
        createDetailRow('Product:', product.product_name),
        createDetailRow('Category:', actualCategory?.name ?? 'Unknown'),
        createDetailRow('Sub Category:', actualSubcategory?.name ?? 'Unknown' ),
        createDetailRow('Price:', `₹${product.mrp}`),
        createDetailRow('Stock:', String(product.quantity))
    );

    dom.productDetails.appendChild(card);
}

/**
 * Replaces the scanning UI with the final summary card.
 * @returns {void}
 */
function renderSummary() {
    const { total, matched, mismatched } = state.stats;

    dom.barcodeResult.innerHTML = '';
    dom.productDetails.innerHTML = '';

    dom.scanButton.classList.add('hidden');
    dom.nextButton.classList.add('hidden');
    dom.finishButton.classList.add('hidden');

    dom.scanHeading.textContent = LABELS.summaryHeading;

    const card = document.createElement('div');
    card.className = 'summary-card';

    const heading = document.createElement('h2');
    heading.textContent = 'Scan Summary';

    const rows = document.createElement('div');
    rows.className = 'summary-rows';
    rows.append(
        createSummaryRow('Total Scanned Products', String(total), 'total'),
        createSummaryRow('Available Products', String(matched), 'matched'),
        createSummaryRow('Not Available Products', String(mismatched), 'mismatched')
    );

    card.append(heading, rows);

    dom.summary.replaceChildren(card);
}

/**
 * Creates a summary row element.
 * @param {string} label
 * @param {string} value
 * @param {string} [modifier]
 * @returns {HTMLDivElement}
 */
function createSummaryRow(label, value, modifier) {
    const row = document.createElement('div');
    row.className = `summary-row${modifier ? ` summary-row--${modifier}` : ''}`;

    const labelEl = document.createElement('span');
    labelEl.className = 'summary-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'summary-value';
    valueEl.textContent = value;

    row.append(labelEl, valueEl);

    return row;
}

/* -------------------------------------------------------------------------- */
/*  Scanning logic                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Checks whether a product belongs to the category / sub-category the user
 * selected. The API returns names, so they are resolved to IDs first.
 * @param {Product} product
 * @returns {{actualCategory?: Category, actualSubcategory?: Subcategory, isMatch: boolean}}
 */
function evaluateProduct(product) {
    const actualCategory = state.categories.find(
        (category) => category.name === product.category_name
    );

    const actualSubcategory = actualCategory?.subcategories?.find(
        (subcategory) => subcategory.name === product.subcategory_name
    );

    const isMatch =
        Boolean(actualCategory && actualSubcategory) &&
        String(actualCategory.id) === String(dom.categorySelect.value) &&
        String(actualSubcategory.id) === String(dom.subCategorySelect.value);

    return { actualCategory, actualSubcategory, isMatch };
}

/**
 * Opens the camera, scans one barcode and shows the result.
 * Updates the counters for summary and displays product details.
 */
async function scanProduct() {
    dom.barcodeResult.innerHTML = '';
    dom.productDetails.innerHTML = '';
    setScanControls({ scan: false, next: false, finish: false });

    try {
        const result = await CapacitorBarcodeScanner.scanBarcode({
            hint: CapacitorBarcodeScannerTypeHint.ALL,
        });

        const barcode = result?.ScanResult?.trim();

        if (!barcode) {
            dom.barcodeResult.innerHTML = `<p>${MESSAGES.noBarcode}</p>`;
            // Allow the user to retry, move on, or finish.
            setScanControls({ scan: true, next: true, finish: true });
            return;
        }

        // Increment the total scanned count.
        state.stats.total += 1;
        dom.totalScannedCount.textContent = String(state.stats.total);
        renderBarcode(barcode);

        // Find the scanned product in the loaded product list.
        const product = state.products.find(
            (item) => String(item.product_id) === barcode
        );

        if (!product) {
            // Product not found.
            state.stats.mismatched += 1;
            renderProductNotFound();
        } else {
            // Check whether the product belongs to the selected
            // category and subcategory.
            const match = evaluateProduct(product);

            if (match.isMatch) {
                // Available product.
                state.stats.matched += 1;

                // Check if the same product(same barcode) is already in the available products list.
                const existingProduct = state.availableProducts.find(
                    (item) => String(item.product_id) === String(product.product_id)
                );

                // For same product, increment the quantity.
                if (existingProduct) {
                    existingProduct.quantity += 1;
                } else {
                    // Add new product to the available products list.
                    state.availableProducts.push({
                        product_id: product.product_id,
                        quantity: 1,
                    });
                }
            } else {
                // Product exists but does not match the selection.
                state.stats.mismatched += 1;
            }

            // Display the product details.
            renderProductCard(product, match);
        }

        dom.scanButton.classList.add('hidden');
        setScanControls({ scan: false, next: true, finish: true });
    } catch (error) {
        console.error('Barcode scan failed:', error);

        renderScanMessage(
            'Barcode scan failed:',
            error?.message || MESSAGES.scanFailed
        );

        setScanControls({ scan: false, next: true, finish: true });
    }
}

/* -------------------------------------------------------------------------- */
/*  Event handlers                                                            */
/* -------------------------------------------------------------------------- */

/** 
 * Logs in via the API, stores the session and opens the selection screen.
 * @returns {void}
 */
async function handleLogin() {
    const username = dom.usernameInput.value.trim();
    const password = dom.passwordInput.value;

    clearLoginError();

    if (!username || !password) {
        showLoginError(MESSAGES.loginRequired);
        return;
    }

    dom.loginButton.disabled = true;

    try {
        const data = await loginUser(username, password);

        // Persist the session so it can be restored on next launch.
        await saveAuth(data);

        applySession(data);

        dom.usernameInput.value = '';
        dom.passwordInput.value = '';

        showScreen(dom.selectionScreen);
    } catch (error) {
        console.error('Login failed:', error);
        showLoginError(error.message || MESSAGES.loginFailed);
    } finally {
        dom.loginButton.disabled = false;
    }
}

/**
 * Loads products for the chosen category / sub-category and starts scanning.
 * @returns {void}
 */
async function handleStartScan() {
    const category = findCategory(dom.categorySelect.value);
    const subcategory = findSubcategory(category, dom.subCategorySelect.value);

    // Validate that both category and sub-category are selected.
    if (!category || !subcategory) {
        return;
    }

    const { accessToken, currentUser } = state;

    // Validate that the session is still valid before loading products.
    if (!accessToken || !currentUser?.id || !currentUser?.store_id) {
        alert(MESSAGES.sessionExpired);
        return;
    }

    // Disable the button and show a loading message while products are fetched.
    dom.startScanButton.disabled = true;
    dom.startScanButton.textContent = LABELS.loadingProducts;

    try {
        // Load products for the selected category and sub-category.
        state.products = await getProducts(
            accessToken,
            currentUser.id,
            currentUser.store_id,
            category.id,
            subcategory.id
        );

        // Reset the scanning state before starting a new scan session.
        resetScan();

        // Show the selected category and sub-category in the scanning screen.
        dom.selectedCategory.textContent = category.name;
        dom.selectedSubCategory.textContent = subcategory.name;

        // Show the current date and time in the scanning screen.
        dom.inventoryUploadedAt.textContent = new Date().toLocaleString(
            'en-IN',
            {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }
        );

        // Show the scanning screen after category selection done.
        showScreen(dom.scanningScreen);

        // If no products were returned, disable the scan button and show a message.
        if (state.products.length === 0) {
            dom.scanButton.disabled = true;
            dom.scanButton.classList.remove('hidden');
            dom.barcodeResult.innerHTML = `<p>${MESSAGES.noProducts}</p>`;
            return;
        }
    } catch (error) {
        console.error('Unable to load products:', error);
        alert(error.message || MESSAGES.productsFailed);
    } finally {
        dom.startScanButton.disabled = false;
        dom.startScanButton.textContent = LABELS.next;
    }
}

/**
 * Submits the scan summary to the API and displays it on success.
 * @returns {Promise<void>}
 */
async function handleFinish() {
    const categoryId = dom.categorySelect.value;
    const subcategoryId = dom.subCategorySelect.value;
    const { accessToken, currentUser, stats, availableProducts } = state;

    // Validate that the session is still valid before submitting.
    if (!accessToken || !currentUser?.id || !currentUser?.store_id) {
        alert(MESSAGES.sessionExpired);
        return;
    }

    dom.finishButton.disabled = true;

    // Submit the summary to the backend API.
    try {
        await submitSummary(
            accessToken,
            currentUser.id,
            currentUser.store_id,
            categoryId,
            subcategoryId,
            stats.total,
            stats.matched,
            stats.mismatched,
            availableProducts
        );

        // Display the summary only after successful submission.
        renderSummary();
    } catch (error) {
        console.error('Unable to submit scan summary:', error);
        alert( error.message || 'Unable to submit scan summary. Please try again.' );

        // Allow the user to retry.
        dom.finishButton.disabled = false;
    }
}

/**
 * Clears the stored session and returns to the login screen.
 * @returns {void}
 */
async function handleLogout() {
    dom.logoutButton.disabled = true;

    try {
        await clearAuth();
        clearSession();
        showScreen(dom.loginScreen);
    } catch (error) {
        console.error('Logout failed:', error);
        alert(MESSAGES.logoutFailed);
    } finally {
        dom.logoutButton.disabled = false;
    }
}

/**
 * Registers all UI event listeners.
 * @returns {void}
 */
function bindEvents() {
    // Login (button click or Enter key in either field).
    dom.loginButton.addEventListener('click', handleLogin);
    [dom.usernameInput, dom.passwordInput].forEach((input) => {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleLogin();
            }
        });
    });

    // Category → sub-category → Start Scanning.
    dom.categorySelect.addEventListener('change', () => {
        populateSubcategories(findCategory(dom.categorySelect.value));
    });
    dom.subCategorySelect.addEventListener('change', () => {
        dom.startScanButton.disabled = !dom.subCategorySelect.value;
    });
    dom.startScanButton.addEventListener('click', handleStartScan);

    // Scanning screen.
    dom.backButton.addEventListener('click', () => {
        resetScan();
        showScreen(dom.selectionScreen);
    });
    dom.scanButton.addEventListener('click', scanProduct);
    dom.nextButton.addEventListener('click', scanProduct);
    dom.finishButton.addEventListener('click', handleFinish);

    // Logout.
    dom.logoutButton.addEventListener('click', handleLogout);
}

/* -------------------------------------------------------------------------- */
/*  Startup                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Restores a previously saved session from storage.
 * @returns {Promise<boolean>} true if a valid session was restored.
 */
async function restoreSession() {
    try {
        const data = await getAuth();

        if (!data) {
            return false;
        }

        // Discard incomplete / corrupted sessions.
        if (!data.access || !data.refresh || !data.user) {
            await clearAuth();
            return false;
        }

        applySession(data);
        showScreen(dom.selectionScreen);

        return true;
    } catch (error) {
        console.error('Failed to restore session:', error);
        return false;
    }
}

/**
 * App entry point.
 * @returns {void}
 */
async function initialiseApp() {
    reportMissingElements();
    bindEvents();
    clearLoginError();
    resetSelection();
    resetScan();

    const restored = await restoreSession();

    if (!restored) {
        populateCategories();
        showScreen(dom.loginScreen);
    }
}

/**
 * Start the app.
 */
initialiseApp();
